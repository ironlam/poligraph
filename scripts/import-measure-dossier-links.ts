#!/usr/bin/env tsx
/**
 * Applique les décisions de la page de revue : écrit un MeasureDossierLink par décision « même
 * objet » ou « texte plus large ». Par défaut : essai à blanc, qui affiche le récapitulatif et
 * n'écrit rien. Il faut --apply pour écrire. .env pointe en production : relire le récapitulatif.
 *
 *   npx tsx --env-file=.env scripts/import-measure-dossier-links.ts \
 *     --decisions=poc-out/decisions.json --proposals=poc-out/proposals.jsonl --reviewer="Nom"
 *   (ajouter --apply pour écrire)
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { createMeasureDossierLink } from "@/lib/measures/dossier-links";
import { MeasureValidationError } from "@/lib/measures/errors";
import {
  planDossierLinkImport,
  type ImportDecision,
  type ImportProposal,
} from "@/lib/measures/dossier-link-import";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const decisionsPath = arg("decisions");
  const proposalsPath = arg("proposals");
  const reviewer = arg("reviewer");
  const apply = process.argv.includes("--apply");
  if (!decisionsPath || !proposalsPath || !reviewer) {
    throw new Error("--decisions, --proposals et --reviewer sont requis");
  }

  const decisions = JSON.parse(readFileSync(decisionsPath, "utf8")) as ImportDecision[];
  const proposals = readFileSync(proposalsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ImportProposal);
  const plan = planDossierLinkImport(decisions, proposals);

  console.log(
    `[import] ${decisions.length} décisions : ${plan.toWrite.length} à écrire, ${plan.rejected} rejetées, ${plan.problems.length} problème(s)`
  );
  for (const p of plan.problems) console.log(`  problème : ${p}`);
  console.table(
    plan.toWrite.map((l) => ({
      mesure: l.measureText.slice(0, 50),
      dossier: l.textTitle.slice(0, 50),
      niveau: l.linkKind,
    }))
  );
  if (!apply) {
    console.log("[import] essai à blanc : rien n'est écrit. Relancer avec --apply pour écrire.");
    return;
  }

  const before = await db.measureDossierLink.count();
  const checkedAt = new Date();
  let written = 0;
  for (const l of plan.toWrite) {
    const measure = await db.measure.findUnique({
      where: { id: l.measureId },
      select: { publishedRevisionId: true },
    });
    if (!measure?.publishedRevisionId) {
      console.log(`  ignoré (mesure sans révision publiée) : ${l.measureText.slice(0, 50)}`);
      continue;
    }
    try {
      await createMeasureDossierLink({
        measureId: l.measureId,
        applicableRevisionId: measure.publishedRevisionId,
        dossierId: l.dossierId,
        linkKind: l.linkKind,
        measureQuote: l.measureQuote,
        textQuote: l.textQuote,
        rationale: l.rationale,
        searchMethod: "poc mistral-embed + mistral-large, relu à la main",
        reviewedBy: reviewer,
        checkedAt,
      });
      written++;
    } catch (err) {
      if (!(err instanceof MeasureValidationError)) throw err;
      console.log(`  refusé : ${l.measureText.slice(0, 50)} : ${err.message}`);
    }
  }
  const after = await db.measureDossierLink.count();
  console.log(
    `[import] écrits : ${written}. MeasureDossierLink : ${before} avant, ${after} après.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
