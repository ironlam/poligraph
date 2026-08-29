/**
 * Repairs fact-checks stored under a variant spelling of an allow-listed
 * publisher.
 *
 * The Google Fact Check Tools API returns a publisher's name as that publisher
 * spells it in its own ClaimReview markup, and the spelling drifts: Franceinfo
 * became "franceinfo", DE FACTO became "De Facto", AFP Factuel became
 * "Factuel AFP". `getPublicationStatusForSource` compared the raw string with
 * FACTCHECK_ALLOWED_SOURCES, so those reviews were stored as DRAFT, and the
 * public listing — which also matches the exact string — never showed them.
 * The sync is fixed (sources are canonicalised on the way in); this repairs
 * the rows imported before the fix.
 *
 * Two writes per row, both narrow:
 *   - `source` is rewritten to the canonical label, so the source facet keeps
 *     one entry per outlet instead of one per spelling.
 *   - DRAFT is lifted to PUBLISHED only when the canonical label is on the
 *     allow-list AND no moderator ever set that row's publicationStatus. A
 *     moderation decision recorded in AuditLog outranks the allow-list: the
 *     one such decision in production unpublished an English-language AFP
 *     review, and this must not undo it.
 *
 * Rows already PUBLISHED are only renamed, never touched otherwise.
 *
 * User-accord-gated: report-only by default, `--apply` performs real writes
 * against the production database (see CLAUDE.local.md — .env and .env.prod
 * point at the same Supabase instance). Do NOT run in CI.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/backfill-factcheck-sources.ts
 *   npx dotenv -e .env -- npx tsx scripts/backfill-factcheck-sources.ts --apply --confirm-production
 */
import { canonicalizeFactCheckSource, FACTCHECK_ALLOWED_SOURCES } from "@/config/labels";

/** Type-only, so importing this module (e.g. from the unit test) never builds a
 *  Prisma client and never needs DATABASE_URL. `db` is imported dynamically in
 *  `main`, following the convention of the other backfill scripts. */
type Db = (typeof import("@/lib/db"))["db"];

export interface BackfillSourcesArgs {
  apply: boolean;
  batch: number;
  showRows: number;
}

export function parseArgs(argv: string[]): BackfillSourcesArgs {
  const has = (f: string) => argv.includes(f);
  const num = (f: string) => {
    const hit = argv.find((a) => a.startsWith(`${f}=`));
    return hit ? Number(hit.split("=")[1]) : undefined;
  };

  const apply = has("--apply");
  if (apply && !has("--confirm-production")) {
    throw new Error("--apply requires --confirm-production (this DB is production)");
  }

  const batch = num("--batch") ?? 500;
  if (!Number.isFinite(batch) || batch < 1) {
    throw new Error(`--batch must be a positive number, got: ${batch}`);
  }
  const showRows = num("--show-rows") ?? 20;
  if (!Number.isFinite(showRows) || showRows < 0) {
    throw new Error(`--show-rows must be zero or a positive number, got: ${showRows}`);
  }

  return { apply, batch, showRows };
}

export interface FactCheckRow {
  id: string;
  slug: string | null;
  source: string;
  publicationStatus: "PUBLISHED" | "DRAFT";
  publishedAt: Date;
}

export interface RepairPlan {
  id: string;
  slug: string | null;
  publishedAt: Date;
  source: { from: string; to: string };
  /** Status to store — the row's own unless the canonical label unlocks it. */
  publicationStatus: "PUBLISHED" | "DRAFT";
  /** True when that status differs from what the row carries today. */
  publish: boolean;
}

/**
 * Plans the repair for one row. Returns null when the stored source is already
 * canonical: a rename that changes nothing must not produce a no-op write, and
 * a row left in DRAFT under a name that was always correct was not a victim of
 * this bug.
 */
export function planRepair(row: FactCheckRow, moderated: ReadonlySet<string>): RepairPlan | null {
  const canonical = canonicalizeFactCheckSource(row.source);
  if (canonical === row.source) return null;

  // Same rule as the sync's getPublicationStatusForSource, applied to the
  // canonical label — but only over a DRAFT row nobody moderated. A row a
  // moderator touched, or one already published, keeps the status it has.
  const unlocked =
    row.publicationStatus === "DRAFT" &&
    !moderated.has(row.id) &&
    FACTCHECK_ALLOWED_SOURCES.includes(canonical);

  return {
    id: row.id,
    slug: row.slug,
    publishedAt: row.publishedAt,
    source: { from: row.source, to: canonical },
    publicationStatus: unlocked ? "PUBLISHED" : row.publicationStatus,
    publish: unlocked,
  };
}

/** Ids whose publicationStatus a moderator set by hand, from the audit trail. */
async function loadModeratedIds(db: Db): Promise<Set<string>> {
  // jsonb_exists() rather than Prisma's JSON path filters: the question is
  // whether the key is present at all, which `path` + `not` cannot express.
  const rows = await db.$queryRaw<Array<{ entityId: string | null }>>`
    SELECT DISTINCT "entityId"
    FROM "AuditLog"
    WHERE "entityType" = 'FactCheck'
      AND jsonb_exists(changes::jsonb, 'publicationStatus')
  `;
  return new Set(rows.map((r) => r.entityId).filter((id): id is string => Boolean(id)));
}

/** Pages through the table so a large corpus never lands in memory at once. */
async function* iterateFactChecks(db: Db, batch: number): AsyncGenerator<FactCheckRow> {
  let cursor: string | undefined;

  for (;;) {
    // Explicit `id > cursor` rather than Prisma's cursor/skip: the rows are
    // rewritten as we go, and skip:1 would step over an unprocessed row.
    const rows = await db.factCheck.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      select: {
        id: true,
        slug: true,
        source: true,
        publicationStatus: true,
        publishedAt: true,
      },
      orderBy: { id: "asc" },
      take: batch,
    });

    if (rows.length === 0) return;

    for (const row of rows) {
      yield {
        id: row.id,
        slug: row.slug,
        source: row.source,
        publicationStatus: row.publicationStatus as "PUBLISHED" | "DRAFT",
        publishedAt: row.publishedAt,
      };
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < batch) return;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { db } = await import("@/lib/db");
  const { revalidateRemoteCache } = await import("./lib/revalidate-cache");

  console.log(
    `[factcheck-sources] source canonicalisation backfill  apply=${args.apply}  batch=${args.batch}`
  );

  const moderated = await loadModeratedIds(db);
  console.log(`[factcheck-sources] rows with a moderation decision on record: ${moderated.size}`);

  let scanned = 0;
  let renamed = 0;
  let published = 0;
  const shown: RepairPlan[] = [];

  for await (const row of iterateFactChecks(db, args.batch)) {
    scanned++;
    const plan = planRepair(row, moderated);
    if (!plan) continue;

    renamed++;
    if (plan.publish) published++;
    if (shown.length < args.showRows) shown.push(plan);

    if (args.apply) {
      await db.factCheck.update({
        where: { id: plan.id },
        data: { source: plan.source.to, publicationStatus: plan.publicationStatus },
      });
    }
  }

  console.log(`[factcheck-sources] fact-checks scanned: ${scanned}`);
  console.log(`[factcheck-sources] stored under a variant spelling: ${renamed}`);
  console.log(`[factcheck-sources] of those, becoming publicly visible: ${published}`);

  for (const plan of shown) {
    const date = plan.publishedAt.toISOString().split("T")[0];
    const flag = plan.publish ? "DRAFT → PUBLISHED" : "rename only";
    console.log(
      `  [${date}] "${plan.source.from}" → "${plan.source.to}"  ${flag}  ${plan.slug ?? plan.id}`
    );
  }
  if (renamed > shown.length) {
    console.log(`  ... and ${renamed - shown.length} more (raise --show-rows to see them)`);
  }

  if (args.apply) {
    console.log(`\n[factcheck-sources] updated ${renamed} row(s)`);
    if (renamed > 0) {
      // Non-fatal: the writes are already committed, and a failed purge only
      // means the listing carries its old page for up to the 24h cache window.
      await revalidateRemoteCache(["factchecks"]).catch((err) => {
        console.warn(`[factcheck-sources] cache purge failed (${err}); purge "factchecks" by hand`);
      });
    }
  } else {
    console.log(`\n[factcheck-sources] report only — re-run with --apply --confirm-production`);
  }

  await db.$disconnect();
}

// Guarded so importing this module never touches the database: main() only
// runs when this file is the process entry point, not on import.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
