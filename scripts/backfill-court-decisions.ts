/**
 * Backfill of court decisions from the pourvoi numbers already stored on affairs (#536).
 *
 * Usage:
 *   npm run backfill:court-decisions -- --dry-run   # report only, writes nothing
 *   npm run backfill:court-decisions -- --apply     # writes, after the same checks
 *
 * Deliberately not a discovery algorithm. It handles the cases measured in the base
 * and refuses to run if the base no longer looks like what was measured: a backfill
 * that adapts to unexpected data is a backfill nobody can review.
 *
 * The pourvoi number is NOT unique — a pourvoi can produce several decisions
 * (rejection, partial cassation, remand) — so idempotence cannot rest on an upsert.
 * It rests on a bounded procedure: look for the expected case, accept zero or one
 * candidate, stop on ambiguity.
 *
 * Nothing is copied from the affair except the pourvoi number itself. `court`,
 * `verdictDate`, `chamber` and `solution` stay null: 23.7 % of `Affair.court` values
 * name a body that renders no decision, and no ECLI is ever inferred.
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import {
  createCourtDecision,
  findCourtDecisionsByPourvoiNumber,
  linkAffairToCourtDecision,
  normalizePourvoiNumber,
} from "../src/services/affairs/court-decisions";

/** What the base looked like when this backfill was designed. */
const EXPECTED = {
  affairs: 463,
  affairsWithPourvoi: 3,
  sharedPourvoiGroups: 1,
  pairDecisions: 8,
  decisionsToCreate: 2,
  linksToCreate: 3,
} as const;

interface Group {
  normalized: string;
  displayed: string;
  affairIds: string[];
  publicIds: string[];
}

class PreconditionError extends Error {}

async function readPreconditions() {
  const [affairs, pairDecisions, existingDecisions, existingLinks] = await Promise.all([
    db.affair.findMany({
      where: { pourvoiNumber: { not: null } },
      select: { id: true, publicId: true, pourvoiNumber: true },
      orderBy: { publicId: "asc" },
    }),
    db.affairPairDecision.count(),
    db.courtDecision.count(),
    db.affairCourtDecision.count(),
  ]);
  const totalAffairs = await db.affair.count();

  const byNormalized = new Map<string, Group>();
  for (const affair of affairs) {
    const normalized = normalizePourvoiNumber(affair.pourvoiNumber!);
    const group = byNormalized.get(normalized) ?? {
      normalized,
      displayed: affair.pourvoiNumber!,
      affairIds: [],
      publicIds: [],
    };
    group.affairIds.push(affair.id);
    group.publicIds.push(affair.publicId ?? affair.id);
    byNormalized.set(normalized, group);
  }
  const groups = [...byNormalized.values()];

  return {
    totalAffairs,
    affairsWithPourvoi: affairs.length,
    pairDecisions,
    existingDecisions,
    existingLinks,
    groups,
    sharedGroups: groups.filter((g) => g.affairIds.length > 1).length,
  };
}

function assertPreconditions(state: Awaited<ReturnType<typeof readPreconditions>>): void {
  const checks: Array<[string, number, number]> = [
    ["affaires", state.totalAffairs, EXPECTED.affairs],
    ["affaires avec pourvoiNumber", state.affairsWithPourvoi, EXPECTED.affairsWithPourvoi],
    ["groupes partageant un pourvoi", state.sharedGroups, EXPECTED.sharedPourvoiGroups],
    ["jugements de paires", state.pairDecisions, EXPECTED.pairDecisions],
    ["décisions à créer", state.groups.length, EXPECTED.decisionsToCreate],
    [
      "liaisons à créer",
      state.groups.reduce((n, g) => n + g.affairIds.length, 0),
      EXPECTED.linksToCreate,
    ],
  ];

  const failures = checks.filter(([, actual, expected]) => actual !== expected);
  console.log("Préconditions :");
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    console.log(`  ${ok ? "OK  " : "ÉCART"} ${label.padEnd(32)} ${actual} (attendu ${expected})`);
  }

  if (failures.length > 0) {
    throw new PreconditionError(
      `La base ne correspond plus aux mesures de conception : ${failures
        .map(([l, a, e]) => `${l} ${a} au lieu de ${e}`)
        .join(" ; ")}. Aucune écriture.`
    );
  }
}

/**
 * The one decision this group should map to, or null when it must be created.
 *
 * Throws on ambiguity rather than picking: several candidates sharing a pourvoi may
 * be several genuine decisions, and choosing one would silently attach an affair to
 * the wrong one.
 */
async function resolveExistingDecision(group: Group): Promise<{ id: string } | null> {
  const candidates = await findCourtDecisionsByPourvoiNumber(group.displayed);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { id: candidates[0]!.id };
  throw new Error(
    `Ambiguïté sur le pourvoi ${group.displayed} : ${candidates.length} décisions candidates ` +
      `(${candidates.map((c) => c.id).join(", ")}). Un pourvoi peut en produire plusieurs, ` +
      `donc ce script s'arrête au lieu de choisir.`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run") || !apply;

  if (apply && args.includes("--dry-run")) {
    throw new Error("--dry-run et --apply sont exclusifs.");
  }

  console.log(
    `Backfill des décisions juridictionnelles — ${apply ? "APPLICATION" : "essai à blanc"}\n`
  );

  const state = await readPreconditions();
  assertPreconditions(state);

  console.log(
    `\nÉtat actuel : ${state.existingDecisions} décision(s), ${state.existingLinks} liaison(s)\n`
  );

  let decisionsCreated = 0;
  let decisionsReused = 0;
  let linksCreated = 0;
  let linksAlreadyPresent = 0;

  for (const group of state.groups) {
    const shared = group.affairIds.length > 1;
    console.log(
      `Pourvoi ${group.displayed} → ${group.publicIds.join(", ")}` +
        `${shared ? "  (partagé : une décision, plusieurs fiches)" : ""}`
    );

    const existing = await resolveExistingDecision(group);
    let decisionId: string;

    if (existing) {
      decisionId = existing.id;
      decisionsReused++;
      console.log(`  décision existante réutilisée : ${decisionId}`);
    } else if (dryRun) {
      decisionsCreated++;
      console.log(`  décision à créer`);
      // No id to link against in a dry run; the link count is derived below.
      linksCreated += group.affairIds.length;
      continue;
    } else {
      const created = await createCourtDecision({ pourvoiNumber: group.displayed });
      decisionId = created.id;
      decisionsCreated++;
      console.log(`  décision créée : ${decisionId}`);
    }

    for (const affairId of group.affairIds) {
      if (dryRun) {
        const already = await db.affairCourtDecision.findUnique({
          where: { affairId_courtDecisionId: { affairId, courtDecisionId: decisionId } },
          select: { affairId: true },
        });
        if (already) linksAlreadyPresent++;
        else linksCreated++;
        continue;
      }
      const result = await linkAffairToCourtDecision({ affairId, courtDecisionId: decisionId });
      if (result.created) linksCreated++;
      else linksAlreadyPresent++;
    }
  }

  console.log(`\nRésultat ${apply ? "appliqué" : "prévu"} :`);
  console.log(`  décisions créées        : ${decisionsCreated}`);
  console.log(`  décisions réutilisées   : ${decisionsReused}`);
  console.log(`  liaisons créées         : ${linksCreated}`);
  console.log(`  liaisons déjà présentes : ${linksAlreadyPresent}`);

  const after = {
    decisions: await db.courtDecision.count(),
    links: await db.affairCourtDecision.count(),
    affairs: await db.affair.count(),
    pairDecisions: await db.affairPairDecision.count(),
    proposals: await db.affairUpdateProposal.count(),
  };
  console.log(`\nÉtat en base :`);
  console.log(`  décisions      : ${after.decisions}`);
  console.log(`  liaisons       : ${after.links}`);
  console.log(`  affaires       : ${after.affairs}`);
  console.log(`  jugements      : ${after.pairDecisions}`);
  console.log(`  propositions   : ${after.proposals}`);

  if (apply) {
    const failures: string[] = [];
    if (after.decisions !== EXPECTED.decisionsToCreate)
      failures.push(`décisions ${after.decisions} au lieu de ${EXPECTED.decisionsToCreate}`);
    if (after.links !== EXPECTED.linksToCreate)
      failures.push(`liaisons ${after.links} au lieu de ${EXPECTED.linksToCreate}`);
    if (after.affairs !== EXPECTED.affairs)
      failures.push(`affaires ${after.affairs} au lieu de ${EXPECTED.affairs}`);
    if (after.pairDecisions !== EXPECTED.pairDecisions)
      failures.push(`jugements ${after.pairDecisions} au lieu de ${EXPECTED.pairDecisions}`);
    if (failures.length > 0) {
      throw new Error(`État final inattendu : ${failures.join(" ; ")}`);
    }
    console.log(`\nÉtat final conforme.`);
  } else {
    console.log(`\nAucune écriture. Relancer avec --apply pour appliquer.`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    await db.$disconnect();
    process.exit(1);
  });
