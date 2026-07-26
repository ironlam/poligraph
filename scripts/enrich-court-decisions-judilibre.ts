/**
 * Targeted Judilibre enrichment of the decisions already in the base (#337).
 *
 * Usage:
 *   npm run enrich:court-decisions              # report only, writes nothing
 *   npm run enrich:court-decisions -- --apply   # writes, after the same checks
 *
 * Explicitly invoked, never scheduled. It works from the pourvoi numbers already
 * stored on `CourtDecision`, so its input is a reference, never a name.
 *
 * It refuses to run if the base no longer looks like what it was designed against:
 * a backfill that adapts to unexpected data is a backfill nobody can review.
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { enrichCourtDecisionFromJudilibre } from "../src/services/affairs/enrich-court-decision";
import { createJudilibreClient } from "../src/lib/api/judilibre";

/** What the base looked like when this run was designed. */
const EXPECTED = {
  affairs: 463,
  courtDecisions: 2,
  links: 3,
  pairDecisions: 8,
  proposals: 0,
  pourvois: ["96-83.698", "97-81.102"],
} as const;

class PreconditionError extends Error {}

async function readState() {
  const [affairs, courtDecisions, links, pairDecisions, proposals, decisions] = await Promise.all([
    db.affair.count(),
    db.courtDecision.count(),
    db.affairCourtDecision.count(),
    db.affairPairDecision.count(),
    db.affairUpdateProposal.count(),
    db.courtDecision.findMany({
      select: {
        id: true,
        judilibreId: true,
        ecli: true,
        pourvoiNumber: true,
        decisionDate: true,
        court: true,
        chamber: true,
        solution: true,
        sourceUrl: true,
      },
      orderBy: { pourvoiNumber: "asc" },
    }),
  ]);
  return { affairs, courtDecisions, links, pairDecisions, proposals, decisions };
}

type State = Awaited<ReturnType<typeof readState>>;

function assertPreconditions(state: State): void {
  const checks: Array<[string, number, number]> = [
    ["affaires", state.affairs, EXPECTED.affairs],
    ["décisions", state.courtDecisions, EXPECTED.courtDecisions],
    ["liaisons", state.links, EXPECTED.links],
    ["jugements de paires", state.pairDecisions, EXPECTED.pairDecisions],
    ["propositions", state.proposals, EXPECTED.proposals],
  ];

  console.log("Préconditions :");
  const failures: string[] = [];
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failures.push(`${label} ${actual} au lieu de ${expected}`);
    console.log(`  ${ok ? "OK  " : "ÉCART"} ${label.padEnd(24)} ${actual} (attendu ${expected})`);
  }

  const pourvois = state.decisions.map((d) => d.pourvoiNumber).filter(Boolean);
  for (const expected of EXPECTED.pourvois) {
    const present = pourvois.includes(expected);
    if (!present) failures.push(`pourvoi ${expected} absent`);
    console.log(`  ${present ? "OK  " : "ÉCART"} pourvoi ${expected}`);
  }

  // An already-enriched decision is not an error: re-running must be possible, and
  // must write nothing. A row pointing at a *different* decision than the one its
  // pourvoi resolves to is caught inside the service, which refuses rather than
  // silently rewriting which decision a published fiche cites.
  const alreadyEnriched = state.decisions.filter((d) => d.judilibreId).length;
  console.log(`  info  déjà enrichies             ${alreadyEnriched}/${state.decisions.length}`);

  if (failures.length > 0) {
    throw new PreconditionError(
      `La base ne correspond plus aux mesures de conception : ${failures.join(" ; ")}. Aucune écriture.`
    );
  }
}

function describe(decision: State["decisions"][number]): string {
  const parts = [
    `judilibreId=${decision.judilibreId ?? "—"}`,
    `ecli=${decision.ecli ?? "—"}`,
    `date=${decision.decisionDate?.toISOString().slice(0, 10) ?? "—"}`,
    `juridiction=${decision.court ?? "—"}`,
    `chambre=${decision.chamber ?? "—"}`,
    `sens=${decision.solution ?? "—"}`,
  ];
  return parts.join(" | ");
}

/** Confirms the built URL actually resolves, rather than assuming the pattern holds. */
async function checkUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return `HTTP ${response.status}`;
  } catch (error) {
    return `injoignable (${error instanceof Error ? error.message : String(error)})`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  if (apply && args.includes("--dry-run")) {
    throw new Error("--dry-run et --apply sont exclusifs.");
  }

  console.log(`Enrichissement Judilibre — ${apply ? "APPLICATION" : "essai à blanc"}\n`);

  if (!createJudilibreClient()) {
    throw new Error("Judilibre n'est pas configuré dans cet environnement. Aucune écriture.");
  }

  const before = await readState();
  assertPreconditions(before);

  console.log("\nAVANT :");
  for (const decision of before.decisions) {
    console.log(`  ${decision.pourvoiNumber} → ${describe(decision)}`);
  }

  if (!apply) {
    console.log("\nAucune écriture. Relancer avec --apply pour appliquer.");
    return;
  }

  console.log("\nEnrichissement :");
  for (const decision of before.decisions) {
    if (!decision.pourvoiNumber) continue;
    const result = await enrichCourtDecisionFromJudilibre({
      courtDecisionId: decision.id,
      pourvoiNumber: decision.pourvoiNumber,
      triggeredBy: "cli",
    });

    if (result.status === "UPDATED") {
      console.log(
        `  ${decision.pourvoiNumber} → ${result.changes.length} champ(s), ${result.judilibreId}`
      );
    } else if (result.status === "UNCHANGED") {
      console.log(`  ${decision.pourvoiNumber} → déjà à jour (${result.judilibreId})`);
    } else {
      throw new Error(
        `${decision.pourvoiNumber} → ${result.status}. Aucune suite : ` +
          `l'enrichissement doit résoudre exactement une décision.`
      );
    }
  }

  const after = await readState();

  console.log("\nAPRÈS :");
  for (const decision of after.decisions) {
    console.log(`  ${decision.pourvoiNumber} → ${describe(decision)}`);
  }

  console.log("\nURLs publiques :");
  for (const decision of after.decisions) {
    if (!decision.sourceUrl) {
      console.log(`  ${decision.pourvoiNumber} → aucune URL`);
      continue;
    }
    console.log(
      `  ${decision.pourvoiNumber} → ${decision.sourceUrl} (${await checkUrl(decision.sourceUrl)})`
    );
  }

  const failures: string[] = [];
  if (after.affairs !== EXPECTED.affairs) failures.push(`affaires ${after.affairs}`);
  if (after.courtDecisions !== EXPECTED.courtDecisions)
    failures.push(`décisions ${after.courtDecisions}`);
  if (after.links !== EXPECTED.links) failures.push(`liaisons ${after.links}`);
  if (after.pairDecisions !== EXPECTED.pairDecisions)
    failures.push(`jugements ${after.pairDecisions}`);
  if (after.proposals !== EXPECTED.proposals) failures.push(`propositions ${after.proposals}`);
  const missing = after.decisions.filter((d) => !d.judilibreId);
  if (missing.length > 0) failures.push(`${missing.length} décision(s) sans identifiant Judilibre`);

  if (failures.length > 0) {
    throw new Error(`État final inattendu : ${failures.join(" ; ")}`);
  }

  console.log(
    `\nÉtat final conforme : ${after.affairs} affaires, ${after.courtDecisions} décisions, ` +
      `${after.links} liaisons, ${after.pairDecisions} jugements, ${after.proposals} propositions.`
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    await db.$disconnect();
    process.exit(1);
  });
