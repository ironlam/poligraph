/**
 * Read-only Judilibre diagnostics (#337).
 *
 * All that remains of the name-based discovery pipeline, which searched the Cour de
 * cassation corpus for a politician's name and created affairs from the hits. Over
 * 156 decisions it produced 0 affairs: the criminal-chamber corpus is pseudonymised
 * doctrinal jurisprudence, so a public figure cannot be recognised in it. It was
 * disabled on 2026-05-15 and removed in #337.
 *
 * **The removed flow must not come back**: name → search → affair. An architecture
 * test enforces it. What replaces it runs the other way: a known judicial reference
 * is looked up and lands on a `CourtDecision`, never on an `Affair`. See
 * `services/affairs/enrich-court-decision.ts`.
 *
 * This module reads and prints. It writes nothing, calls no API, and is reachable
 * only from an explicitly invoked script — never from a cron.
 */

import { db } from "@/lib/db";
import { DataSource } from "@/generated/prisma";
import { syncMetadata } from "@/lib/sync";

const SYNC_SOURCE_KEY = "judilibre";

/**
 * Counts left behind by the retired pipeline.
 *
 * The `IdentityDecision` rows it reports are kept on purpose: they are the audit
 * trail of the 156 decisions that matched nobody, and they are the evidence the
 * pipeline was retired on.
 */
export async function getJudilibreStats(): Promise<void> {
  const [meta, affairsWithDecision, affairsWithJudilibreSource, totalAffairs, identityDecisions] =
    await Promise.all([
      syncMetadata.get(SYNC_SOURCE_KEY),
      db.affair.count({ where: { courtDecisions: { some: {} } } }),
      db.source.count({ where: { sourceType: "JUDILIBRE" } }),
      db.affair.count(),
      db.identityDecision.groupBy({
        by: ["judgement"],
        where: { sourceType: DataSource.JUDILIBRE, supersededBy: null },
        _count: true,
      }),
    ]);

  const [courtDecisions, enrichedDecisions, links] = await Promise.all([
    db.courtDecision.count(),
    db.courtDecision.count({ where: { judilibreId: { not: null } } }),
    db.affairCourtDecision.count(),
  ]);

  console.log("\n" + "=".repeat(60));
  console.log("Judilibre — diagnostic (découverte nominale retirée)");
  console.log("=".repeat(60));

  console.log(
    meta
      ? `\nDernier passage de l'ancien pipeline : ${meta.lastSyncAt?.toLocaleString("fr-FR") ?? "jamais"}`
      : "\nL'ancien pipeline n'a jamais tourné sur cette base"
  );

  console.log(`\nAffaires : ${totalAffairs}`);
  console.log(`  dont décision rattachée : ${affairsWithDecision}`);
  console.log(`  sources Judilibre : ${affairsWithJudilibreSource}`);

  console.log(`\nDécisions juridictionnelles : ${courtDecisions}`);
  console.log(`  enrichies depuis Judilibre : ${enrichedDecisions}`);
  console.log(`  liaisons vers des affaires : ${links}`);

  if (identityDecisions.length > 0) {
    const counts = Object.fromEntries(identityDecisions.map((d) => [d.judgement, d._count]));
    const total = identityDecisions.reduce((sum, d) => sum + d._count, 0);
    console.log(`\nRésolutions d'identité laissées par l'ancien pipeline : ${total}`);
    console.log(`  SAME : ${counts.SAME ?? 0}`);
    console.log(`  UNDECIDED : ${counts.UNDECIDED ?? 0}`);
    console.log(`  NOT_SAME : ${counts.NOT_SAME ?? 0}`);
  }
}
