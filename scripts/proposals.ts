/**
 * CLI de revue des propositions de modification d'affaires (Affaires v2, lot 1).
 *
 * Alternative en ligne de commande à l'interface admin, pour revoir une file de
 * propositions sans ouvrir le navigateur. Sortie lisible par défaut, `--json`
 * pour un traitement automatisé.
 *
 * Passe par acceptProposal/rejectProposal, donc conserve toutes les garanties :
 * compare-and-set sur PENDING, détection de dérive, transaction unique,
 * ModerationReview et AuditLog.
 *
 * Usage :
 *   npm run proposals                        liste les propositions en attente
 *   npm run proposals -- --group             regroupe la file en décisions
 *   npm run proposals -- --status=CONFLICT   autre état
 *   npm run proposals -- --json              sortie machine
 *
 *   npm run proposals -- --accept=<id> [--note="..."]
 *   npm run proposals -- --reject=<id> [--note="..."]
 *   npm run proposals -- --accept-ids=<id,id,id>
 *   npm run proposals -- --reject-ids=<id,id,id>
 *
 *   npm run proposals -- --accept-batch [--run=<id>] [--importer=<nom>]
 *                        [--risk=LOW,MEDIUM] [--limit=500] [--note="..."]
 *                        [--include-events]
 *
 * Le traitement par lot reste séquentiel : chaque acceptation garde sa propre
 * transaction, son compare-and-set et sa détection de dérive. Un échec sur une
 * proposition n'interrompt pas les suivantes.
 */
import { db } from "@/lib/db";
import { acceptProposal, rejectProposal } from "@/services/affairs/proposal-review";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";
import type { Prisma, ProposalRisk, ProposalStatus } from "@/generated/prisma";
import { parseAffairProposalPayload } from "@/lib/security/schemas/affair-proposal";
import {
  collectProposalCandidatesForBatch,
  selectProposalIdsForBatch,
} from "@/services/affairs/proposal-batch";

/** Persisted in reviewedBy and in the audit trail. Names the channel, nothing more. */
const REVIEWED_BY = "cli";

const FIELD_LABELS: Record<string, string> = {
  status: "statut",
  verdictDate: "date de décision",
  court: "juridiction",
  sentence: "peine (résumé)",
  prisonMonths: "prison (mois)",
  prisonFirmMonths: "prison, part non assortie du sursis (mois)",
  fineAmount: "amende (€)",
  ineligibilityMonths: "inéligibilité (mois)",
  ineligibilityFirmMonths: "inéligibilité, part non assortie du sursis (mois)",
  communityService: "TIG (heures)",
  otherSentence: "autre peine",
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "vide";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "vide";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleDateString("fr-FR");
  }
  return String(value);
}

function isEventProposal(raw: unknown): boolean {
  try {
    return parseAffairProposalPayload(raw).kind === "ADD_EVENT";
  } catch {
    return false;
  }
}

/**
 * Invalidation après application, comme le fait la route admin. Hors runtime
 * Next.js, revalidatePath/revalidateTag lèvent : on l'annonce sans échouer, le
 * cache retombera sur son backstop.
 */
function invalidate(affairSlug: string, politicianSlug: string): string {
  try {
    invalidateEntity("affair", affairSlug);
    invalidateAffectedPoliticians([politicianSlug]);
    return "caches invalidés";
  } catch {
    return "invalidation impossible hors runtime Next (backstop 24 h, ou relancer depuis l'admin)";
  }
}

async function list(status: ProposalStatus, asJson: boolean) {
  const rows = await db.affairUpdateProposal.findMany({
    where: { status },
    orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      importer: true,
      importRunId: true,
      extractorVersion: true,
      proposedPatch: true,
      observedValues: true,
      affairSnapshot: true,
      riskLevel: true,
      confidence: true,
      rationale: true,
      source: true,
      sourceUrl: true,
      conflictDetail: true,
      createdAt: true,
      affair: { select: { slug: true, publicationStatus: true } },
    },
  });

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const counts = await db.affairUpdateProposal.groupBy({ by: ["status"], _count: true });
  console.log(
    `États : ${counts.map((c) => `${c.status}=${c._count}`).join("  ") || "aucune proposition"}\n`
  );

  if (rows.length === 0) {
    console.log(`Aucune proposition en ${status}.`);
    return;
  }

  console.log(
    `${rows.length} proposition(s) en ${status}, du risque le plus élevé au plus bas :\n`
  );

  for (const r of rows) {
    const snap = r.affairSnapshot as { title?: string; politicianName?: string };
    const patch = r.proposedPatch as Record<string, unknown>;
    const observed = r.observedValues as Record<string, unknown>;
    let parsed: ReturnType<typeof parseAffairProposalPayload> | null = null;
    let payloadError: string | null = null;
    try {
      parsed = parseAffairProposalPayload(patch);
    } catch (error) {
      payloadError = error instanceof Error ? error.message : "Payload invalide";
    }

    console.log(`─── ${r.id}`);
    console.log(`  affaire   : ${snap?.title ?? "(supprimée)"}`);
    console.log(
      `  personne  : ${snap?.politicianName ?? "?"}${r.affair ? ` · ${r.affair.publicationStatus}` : " · AFFAIRE SUPPRIMÉE"}`
    );
    console.log(
      `  risque    : ${r.riskLevel} · confiance ${r.confidence} · ${r.importer}@${r.extractorVersion}`
    );
    console.log(`  run       : ${r.importRunId}`);
    if (!parsed) {
      console.log("  opération  : payload invalide");
      console.log(`  erreur     : ${payloadError}`);
    } else if (parsed.kind === "ADD_EVENT") {
      console.log("  opération  : nouvel événement de chronologie");
      console.log(`  date       : ${fmt(parsed.event.date.toISOString())}`);
      console.log(`  type       : ${parsed.event.type}`);
      console.log(`  titre      : ${parsed.event.title}`);
      console.log(`  source     : ${parsed.event.sourceTitle}`);
      console.log(`  URL        : ${parsed.event.sourceUrl}`);
    } else {
      for (const key of Object.keys(patch)) {
        const label = FIELD_LABELS[key] ?? key;
        console.log(`  ${label.padEnd(22)} ${fmt(observed[key])}  →  ${fmt(patch[key])}`);
      }
    }
    console.log(`  pourquoi  : ${r.rationale}`);
    if (r.sourceUrl && parsed?.kind !== "ADD_EVENT") {
      console.log(`  source    : ${r.source} ${r.sourceUrl}`);
    }
    if (r.conflictDetail) console.log(`  conflit   : ${JSON.stringify(r.conflictDetail)}`);
    console.log("");
  }

  console.log('Pour appliquer :  npm run proposals -- --accept=<id> --note="..."');
  console.log('Pour refuser  :  npm run proposals -- --reject=<id> --note="..."');
}

interface Outcome {
  ok: boolean;
  /** Slugs to invalidate once, at the end of a batch. */
  affairSlug?: string;
  politicianSlug?: string;
}

/**
 * Applies one proposal. Returns the outcome instead of only printing, so a batch
 * can count reliably and defer cache invalidation to a single pass.
 */
async function accept(id: string, note?: string, quiet = false): Promise<Outcome> {
  const result = await acceptProposal({
    proposalId: id,
    reviewedBy: REVIEWED_BY,
    reviewNotes: note,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "conflict":
        console.error(`ÉCHEC ${id} : la valeur en base a changé → passée en CONFLICT.`);
        console.error(`  ${JSON.stringify(result.conflictDetail)}`);
        break;
      case "invalid_patch":
        console.error(`ÉCHEC ${id} : patch invalide → ${result.issues.join("; ")}`);
        break;
      case "invalid_split":
        console.error(`ÉCHEC ${id} : répartition incohérente → ${result.issues.join("; ")}`);
        console.error(`  reste PENDING : le patch est valide, c'est la fusion qui ne l'est pas.`);
        break;
      case "orphaned":
        console.error(`ÉCHEC ${id} : affaire supprimée, seul le rejet est possible.`);
        break;
      case "not_pending":
        console.error(`ÉCHEC ${id} : déjà traitée (${result.status}).`);
        break;
      case "not_found":
        console.error(`ÉCHEC ${id} : introuvable.`);
        break;
    }
    return { ok: false };
  }

  if (!quiet) {
    console.log(`APPLIQUÉ ${id} → ${result.appliedFields.join(", ")} (${result.affairSlug})`);
  }
  return { ok: true, affairSlug: result.affairSlug, politicianSlug: result.politicianSlug };
}

async function reject(id: string, note?: string, quiet = false): Promise<Outcome> {
  const result = await rejectProposal({
    proposalId: id,
    reviewedBy: REVIEWED_BY,
    reviewNotes: note,
  });
  if (!result.ok) {
    console.error(`ÉCHEC ${id} : ${result.reason}`);
    return { ok: false };
  }
  if (!quiet) console.log(`REJETÉ ${id}`);
  return { ok: true };
}

/** One invalidation pass for a whole batch, instead of one per proposal. */
function invalidateBatch(outcomes: Outcome[]): void {
  const affairs = new Set<string>();
  const politicians = new Set<string>();
  for (const o of outcomes) {
    if (o.affairSlug) affairs.add(o.affairSlug);
    if (o.politicianSlug) politicians.add(o.politicianSlug);
  }
  if (affairs.size === 0) return;
  try {
    for (const slug of affairs) invalidateEntity("affair", slug);
    invalidateAffectedPoliticians([...politicians]);
    console.log(`caches invalidés : ${affairs.size} affaire(s), ${politicians.size} politique(s)`);
  } catch {
    console.log(
      "invalidation impossible hors runtime Next (backstop 24 h, ou appliquer depuis l'admin)"
    );
  }
}

interface BatchFilter {
  importRunId?: string;
  importer?: string;
  risk?: ProposalRisk[];
  fields?: string[];
}

function buildWhere(f: BatchFilter): Prisma.AffairUpdateProposalWhereInput {
  return {
    status: "PENDING",
    ...(f.importRunId ? { importRunId: f.importRunId } : {}),
    ...(f.importer ? { importer: f.importer } : {}),
    ...(f.risk?.length ? { riskLevel: { in: f.risk } } : {}),
  };
}

/**
 * Collapses a PENDING queue into decision groups.
 *
 * A batch of 200 proposals is rarely 200 decisions: the same importer proposing
 * the same field over and over is one editorial judgement. Grouping on
 * (importer, extractorVersion, risk, set of fields) is what turns a 200-line list
 * into a handful of calls.
 */
async function group(f: BatchFilter, asJson: boolean) {
  const rows = await db.affairUpdateProposal.findMany({
    where: buildWhere(f),
    select: {
      id: true,
      importer: true,
      extractorVersion: true,
      riskLevel: true,
      importRunId: true,
      proposedPatch: true,
      observedValues: true,
      affairSnapshot: true,
    },
  });

  if (rows.length === 0) {
    console.log("Aucune proposition PENDING sur ce périmètre.");
    return;
  }

  const groups = new Map<
    string,
    {
      importer: string;
      version: string;
      risk: string;
      fields: string[];
      /** Fields whose current value is non-empty: the patch overwrites them. */
      overwrites: string[];
      ids: string[];
      affairs: Set<string>;
      runs: Set<string>;
    }
  >();

  for (const r of rows) {
    const patch = r.proposedPatch as Record<string, unknown>;
    const observed = r.observedValues as Record<string, unknown>;
    const eventProposal = isEventProposal(patch);
    const fields = eventProposal ? ["event"] : Object.keys(patch).sort();
    const overwrites = fields.filter(
      (k) => observed[k] !== null && observed[k] !== undefined && observed[k] !== ""
    );
    const key = `${r.importer}@${r.extractorVersion}|${r.riskLevel}|${fields.join(",")}|${overwrites.join(",")}`;
    const snap = r.affairSnapshot as { title?: string };

    const g = groups.get(key) ?? {
      importer: r.importer,
      version: r.extractorVersion,
      risk: r.riskLevel,
      fields,
      overwrites,
      ids: [],
      affairs: new Set<string>(),
      runs: new Set<string>(),
    };
    g.ids.push(r.id);
    g.affairs.add(snap?.title ?? "?");
    g.runs.add(r.importRunId);
    groups.set(key, g);
  }

  const sorted = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);

  if (asJson) {
    console.log(
      JSON.stringify(
        sorted.map((g) => ({ ...g, affairs: [...g.affairs], runs: [...g.runs] })),
        null,
        2
      )
    );
    return;
  }

  console.log(`${rows.length} proposition(s) PENDING → ${sorted.length} groupe(s) de décision\n`);

  let i = 0;
  for (const g of sorted) {
    i++;
    console.log(`[${i}] ${g.ids.length} proposition(s) · risque ${g.risk}`);
    console.log(`    importeur : ${g.importer}@${g.version}`);
    console.log(`    champs    : ${g.fields.join(", ")}`);
    if (g.overwrites.length > 0) {
      console.log(`    ÉCRASE    : ${g.overwrites.join(", ")}  ← à regarder de près`);
    }
    console.log(`    affaires  : ${g.affairs.size} distincte(s)`);
    if (g.affairs.size <= 4) console.log(`                ${[...g.affairs].join(" / ")}`);
    console.log(
      `    appliquer : npm run proposals -- --accept-ids=${g.ids.slice(0, 3).join(",")}${g.ids.length > 3 ? ",…" : ""}${g.fields.includes("event") ? " --include-events" : ""}`
    );
    console.log("");
  }

  console.log("Raccourcis de lot :");
  console.log('  npm run proposals -- --accept-batch --risk=LOW,MEDIUM --note="..."');
  console.log('  npm run proposals -- --accept-batch --run=<id> --note="..."');
  console.log("  npm run proposals -- --group --json    (pour récupérer les ids par groupe)");
}

/**
 * Applies a whole filtered batch, sequentially.
 *
 * Sequential on purpose: each acceptance is its own transaction with its own
 * compare-and-set and drift check, and running them in parallel would only add
 * lock contention on the same affairs. A failure on one never stops the others.
 */
async function acceptBatch(
  f: BatchFilter,
  note: string | undefined,
  limit: number,
  includeEvents: boolean
) {
  const { rows, excludedEvents } = await collectProposalCandidatesForBatch(
    ({ skip, take }) =>
      db.affairUpdateProposal.findMany({
        where: buildWhere(f),
        select: { id: true, riskLevel: true, proposedPatch: true },
        // Low risk first: the cheap wins land even if a later one fails.
        orderBy: [{ riskLevel: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip,
        take,
      }),
    limit,
    includeEvents
  );

  if (excludedEvents > 0) {
    console.log(
      `${excludedEvents} proposition(s) d’événement exclue(s) du lot. Utilisez --include-events pour les inclure explicitement.\n`
    );
  }

  if (rows.length === 0) {
    console.log("Aucune proposition PENDING sur ce périmètre.");
    return;
  }

  const byRisk = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.riskLevel] = (acc[r.riskLevel] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `${rows.length} proposition(s) à appliquer : ${Object.entries(byRisk)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}\n`
  );

  const outcomes: Outcome[] = [];
  const started = Date.now();
  for (const row of rows) {
    outcomes.push(await accept(row.id, note, true));
  }

  const applied = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - applied;
  console.log(
    `\n${applied}/${rows.length} appliquée(s)${failed > 0 ? `, ${failed} en échec (voir ci-dessus)` : ""} en ${((Date.now() - started) / 1000).toFixed(1)} s`
  );
  invalidateBatch(outcomes);
}

async function rejectBatch(ids: string[], note: string | undefined) {
  const outcomes: Outcome[] = [];
  for (const id of ids) outcomes.push(await reject(id, note, true));
  const done = outcomes.filter((o) => o.ok).length;
  console.log(`${done}/${ids.length} rejetée(s).`);
}

async function acceptSelectedIds(
  ids: string[],
  note: string | undefined,
  includeEvents: boolean
): Promise<void> {
  const candidates = await db.affairUpdateProposal.findMany({
    where: { id: { in: ids } },
    select: { id: true, proposedPatch: true },
  });
  const { acceptedIds, excludedEventIds } = selectProposalIdsForBatch(
    ids,
    candidates,
    includeEvents
  );
  if (excludedEventIds.length > 0) {
    console.log(
      `${excludedEventIds.length} proposition(s) d’événement exclue(s). Utilisez --include-events pour les accepter explicitement.\n`
    );
  }

  const outcomes: Outcome[] = [];
  for (const id of acceptedIds) outcomes.push(await accept(id, note, true));
  console.log(
    `${outcomes.filter((outcome) => outcome.ok).length}/${acceptedIds.length} appliquée(s).`
  );
  invalidateBatch(outcomes);
}

function parseRisk(raw: string | undefined): ProposalRisk[] | undefined {
  if (!raw) return undefined;
  const valid: ProposalRisk[] = ["LOW", "MEDIUM", "HIGH"];
  return raw
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter((r): r is ProposalRisk => valid.includes(r as ProposalRisk));
}

async function main() {
  const note = arg("note");
  const filter: BatchFilter = {
    importRunId: arg("run") ?? arg("accept-run"),
    importer: arg("importer"),
    risk: parseRisk(arg("risk")),
  };

  const acceptIds = arg("accept-ids");
  if (acceptIds) {
    const ids = acceptIds.split(",").filter(Boolean);
    return acceptSelectedIds(ids, note, flag("include-events"));
  }

  const rejectIds = arg("reject-ids");
  if (rejectIds) return rejectBatch(rejectIds.split(",").filter(Boolean), note);

  const acceptId = arg("accept");
  if (acceptId) {
    const outcome = await accept(acceptId, note);
    invalidateBatch([outcome]);
    return;
  }

  const rejectId = arg("reject");
  if (rejectId) {
    await reject(rejectId, note);
    return;
  }

  if (flag("accept-batch")) {
    const limit = Number.parseInt(arg("limit") ?? "500", 10);
    return acceptBatch(filter, note, limit, flag("include-events"));
  }

  // --accept-run kept as a shorthand for the whole run.
  if (arg("accept-run")) return acceptBatch(filter, note, 500, flag("include-events"));

  if (flag("group")) return group(filter, flag("json"));

  const status = (arg("status") ?? "PENDING").toUpperCase() as ProposalStatus;
  return list(status, flag("json"));
}

main()
  .catch((error) => {
    console.error("ERREUR :", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
