/**
 * Repairs stored citizen impacts that cast the reader as a participant in the
 * vote ("Vous votez sur...", "Vous assistez à un vote...", "Votre vote...").
 *
 * Those formulations came from a prompt rule that asked for a blanket
 * vouvoiement of the reader; the model read it as a mandate to place the reader
 * inside the hemicycle. The prompt is fixed, but rows generated before the fix
 * keep the wording. This tool rewrites them with `neutralizeReaderAsVoter` — a
 * deterministic rewrite over a closed set of formulations, NO model call, so it
 * is free, instant and reproducible.
 *
 * Only the offending clause changes; everything the model said about the
 * measure is preserved byte-for-byte, so no coherence re-check is needed.
 * `citizenImpactDate` is deliberately left untouched: the text was not
 * regenerated, and that column records when the model produced it.
 *
 * User-accord-gated: report-only by default, `--apply` performs real writes
 * against the production database (see CLAUDE.local.md — .env and .env.prod
 * point at the same Supabase instance). Do NOT run in CI.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/backfill-citizen-impact-reader-role.ts
 *   npx dotenv -e .env -- npx tsx scripts/backfill-citizen-impact-reader-role.ts --show-diff=20
 *   npx dotenv -e .env -- npx tsx scripts/backfill-citizen-impact-reader-role.ts --apply --confirm-production
 */
import { neutralizeReaderAsVoter } from "@/services/scrutin-citizen-impact";

/** Type-only, so importing this module (e.g. from the unit test) never builds a
 *  Prisma client and never needs DATABASE_URL. `db` is imported dynamically in
 *  `main`, following the convention of the other backfill scripts. */
type Db = (typeof import("@/lib/db"))["db"];

/**
 * Cheap DB-side prefilter. MUST stay a superset of what
 * `neutralizeReaderAsVoter` rewrites: it only narrows how many rows travel to
 * the client, and every candidate is re-checked with the real rewriter before
 * any write. Postgres ILIKE is accent-sensitive, so accents are spelled out.
 */
const CANDIDATE_MARKERS = [
  "vous votez",
  "vous allez voter",
  "vous avez voté",
  "vous assistez à",
  "vous participez à",
  "vous vous prononcez",
  "vous êtes appelé",
  "vous etes appelé",
  "votre vote",
] as const;

export interface BackfillReaderRoleArgs {
  apply: boolean;
  limit?: number;
  batch: number;
  showDiff: number;
}

export function parseArgs(argv: string[]): BackfillReaderRoleArgs {
  const has = (f: string) => argv.includes(f);
  const num = (f: string) => {
    const hit = argv.find((a) => a.startsWith(`${f}=`));
    return hit ? Number(hit.split("=")[1]) : undefined;
  };

  const apply = has("--apply");
  if (apply && !has("--confirm-production")) {
    throw new Error("--apply requires --confirm-production (this DB is production)");
  }

  const limit = num("--limit");
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error(`--limit must be a positive number, got: ${limit}`);
  }
  const batch = num("--batch") ?? 500;
  if (!Number.isFinite(batch) || batch < 1) {
    throw new Error(`--batch must be a positive number, got: ${batch}`);
  }
  const showDiff = num("--show-diff") ?? 5;
  if (!Number.isFinite(showDiff) || showDiff < 0) {
    throw new Error(`--show-diff must be zero or a positive number, got: ${showDiff}`);
  }

  return { apply, limit, batch, showDiff };
}

export interface ImpactRow {
  id: string;
  slug: string | null;
  chamber: "AN" | "SENAT";
  citizenImpact: string;
}

export interface RewritePlan {
  id: string;
  slug: string | null;
  before: string;
  after: string;
}

/**
 * Plans the rewrite for one row. Returns null when the rewriter leaves the text
 * unchanged — a prefilter hit on a legitimate "vous" ("Si vous êtes locataire,
 * ... votre vote de 2027" is not a participant formulation) must not produce a
 * no-op write.
 */
export function planRewrite(row: ImpactRow): RewritePlan | null {
  const after = neutralizeReaderAsVoter(row.citizenImpact, row.chamber);
  if (after === row.citizenImpact) return null;
  return { id: row.id, slug: row.slug, before: row.citizenImpact, after };
}

/** First line that differs, as a compact before/after pair for the report. */
export function firstChangedLine(plan: RewritePlan): { before: string; after: string } | null {
  const before = plan.before.split("\n");
  const after = plan.after.split("\n");
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) {
      return { before: before[i] ?? "", after: after[i] ?? "" };
    }
  }
  return null;
}

/** Pages through the candidate rows so a large table never lands in memory at once. */
async function* iterateCandidates(
  db: Db,
  batch: number,
  limit?: number
): AsyncGenerator<ImpactRow> {
  let cursor: string | undefined;
  let emitted = 0;

  for (;;) {
    const take = limit ? Math.min(batch, limit - emitted) : batch;
    if (take <= 0) return;

    // Explicit `id > cursor` rather than Prisma's cursor/skip: under --apply a
    // rewritten row stops matching the filter, and skip:1 would then step over
    // an unprocessed row instead of the consumed one.
    const rows = await db.scrutin.findMany({
      where: {
        citizenImpact: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
        OR: CANDIDATE_MARKERS.map((marker) => ({
          citizenImpact: { contains: marker, mode: "insensitive" as const },
        })),
      },
      select: { id: true, slug: true, chamber: true, citizenImpact: true },
      orderBy: { id: "asc" },
      take,
    });

    if (rows.length === 0) return;

    for (const row of rows) {
      yield {
        id: row.id,
        slug: row.slug,
        chamber: row.chamber as "AN" | "SENAT",
        citizenImpact: row.citizenImpact!,
      };
      emitted++;
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < take) return;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { db } = await import("@/lib/db");

  console.log(
    `[reader-role] citizen-impact reader-role backfill  apply=${args.apply}` +
      `  batch=${args.batch}${args.limit ? `  limit=${args.limit}` : ""}`
  );

  let scanned = 0;
  let rewritable = 0;
  let updated = 0;
  const shown: RewritePlan[] = [];

  for await (const row of iterateCandidates(db, args.batch, args.limit)) {
    scanned++;
    const plan = planRewrite(row);
    if (!plan) continue;

    rewritable++;
    if (shown.length < args.showDiff) shown.push(plan);

    if (args.apply) {
      await db.scrutin.update({
        where: { id: plan.id },
        data: { citizenImpact: plan.after },
      });
      updated++;
    }
  }

  console.log(`[reader-role] candidates scanned: ${scanned}`);
  console.log(`[reader-role] rows needing a rewrite: ${rewritable}`);
  console.log(
    `[reader-role] false positives (prefilter hit, nothing to rewrite): ${scanned - rewritable}`
  );

  for (const plan of shown) {
    const diff = firstChangedLine(plan);
    if (!diff) continue;
    console.log(`\n  ${plan.slug ?? plan.id}`);
    console.log(`    - ${diff.before.slice(0, 160)}`);
    console.log(`    + ${diff.after.slice(0, 160)}`);
  }
  if (rewritable > shown.length) {
    console.log(`\n  ... and ${rewritable - shown.length} more (raise --show-diff to see them)`);
  }

  if (args.apply) {
    console.log(`\n[reader-role] updated ${updated} row(s)`);
  } else {
    console.log("\n[reader-role] report-only (pass --apply --confirm-production to write)");
  }

  await db.$disconnect();
}

// Guarded so importing this module never touches the database: main() only
// runs when this file is the process entry point, not on import.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
