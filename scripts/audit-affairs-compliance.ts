/**
 * Audit de conformité RGPD article 10 des affaires existantes.
 * LECTURE SEULE : ne modifie jamais la base.
 *
 * Sortie : tableaux console + data/affairs-compliance-audit.json consommable
 * par une session /moderate (flag prioritaire sur les affaires PUBLISHED
 * sans verifiedBy).
 *
 * Usage :
 *   npx dotenv -e .env -- npx tsx scripts/audit-affairs-compliance.ts
 *   npm run audit:compliance -- --fail-on-leak   # code de sortie 1 si écart
 *
 * --fail-on-leak permet d'utiliser cet audit comme étape bloquante en CI,
 * après un import automatisé.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../src/lib/db";
import { getAdverseAffairWhere } from "../src/lib/affairs/public-filters";

async function main() {
  // 1. PUBLISHED sans verifiedBy (validation humaine non tracée) — flag prioritaire
  const noVerifiedBy = await db.affair.findMany({
    where: { publicationStatus: "PUBLISHED", verifiedBy: null },
    select: { id: true, slug: true, title: true, status: true, verifiedAt: true },
    orderBy: { createdAt: "asc" },
  });

  // 2. Signature auto-publish Wikidata (verifiedAt non null + verifiedBy null + source WIKIDATA)
  const wikidataAuto = await db.affair.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      verifiedBy: null,
      verifiedAt: { not: null },
      sources: { some: { sourceType: "WIKIDATA" } },
    },
    select: { id: true, slug: true, title: true },
  });

  // 3. PUBLISHED sans aucune source
  const noSource = await db.affair.findMany({
    where: { publicationStatus: "PUBLISHED", sources: { none: {} } },
    select: { id: true, slug: true, title: true },
  });

  // 4. PUBLISHED en statut faible (enquête préliminaire, DIRECT/INDIRECT)
  const enquetes = await db.affair.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      status: "ENQUETE_PRELIMINAIRE",
      involvement: { in: ["DIRECT", "INDIRECT"] },
    },
    select: { id: true, slug: true, title: true },
  });

  // 5. Issues favorables : vérification structurelle. L'agrégat à charge ne
  //    doit contenir aucun statut favorable (intersection vide). Contrôle en
  //    mémoire sur la config, pas en base : c'est une propriété du code.
  const FAVORABLE_STATUSES = [
    "RELAXE",
    "ACQUITTEMENT",
    "NON_LIEU",
    "CLASSEMENT_SANS_SUITE",
    "PRESCRIPTION",
  ] as const;
  const adverseStatuses = (getAdverseAffairWhere().status as { in: string[] }).in;
  const favorablesDansAgregat = FAVORABLE_STATUSES.filter((s) =>
    adverseStatuses.includes(s)
  ).length;

  // 6. Décisions resolver orphelines pointant vers une affaire PUBLISHED
  //    (rattachement probable issu d'un resolver mais sans affairId lié)
  //    Join : AffairPoliticianDecision.sourceRef = Source.url → Source.affairId = Affair.id
  //    Vérification croisée : Affair.politicianId = AffairPoliticianDecision.chosenPoliticianId
  const orphans = await db.$queryRaw<
    Array<{
      decision_id: string;
      affair_id: string;
      affair_slug: string;
      judgment: string;
    }>
  >`
    SELECT
      d.id          AS decision_id,
      a.id          AS affair_id,
      a.slug        AS affair_slug,
      d.judgment::text AS judgment
    FROM "AffairPoliticianDecision" d
    JOIN "Source" s
      ON s.url = d."sourceRef"
    JOIN "Affair" a
      ON a.id = s."affairId"
      AND a."politicianId" = d."chosenPoliticianId"
    WHERE d."affairId" IS NULL
      AND d."sourceRef" <> ''
      AND d.judgment IN ('SAME', 'UNDECIDED')
      AND a."publicationStatus" = 'PUBLISHED'
  `;

  const summary = {
    generatedAt: new Date().toISOString(),
    publishedSansVerifiedBy: noVerifiedBy.length,
    wikidataAutoPublish: wikidataAuto.length,
    publishedSansSource: noSource.length,
    enquetesPreliminairesPubliees: enquetes.length,
    issuesFavorablesDansAgregatACharge: favorablesDansAgregat,
    decisionsOrphelinesVersPublished: orphans.length,
  };

  console.log("\n=== Audit conformité affaires (RGPD art. 10) ===\n");
  console.table(summary);
  console.log("\n— PUBLISHED sans verifiedBy (revue prioritaire) —");
  console.table(
    noVerifiedBy.map((a) => ({
      id: a.id,
      slug: a.slug.slice(0, 60),
      status: a.status,
    }))
  );
  if (noSource.length > 0) {
    console.log("\n— PUBLISHED sans source (anomalie bloquante pour le guard) —");
    console.table(noSource);
  }
  if (orphans.length > 0) {
    console.log("\n— Décisions orphelines à relier (affairId manquant) —");
    console.table(orphans);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(
    "data/affairs-compliance-audit.json",
    JSON.stringify(
      {
        summary,
        priorityReview: noVerifiedBy.map((a) => ({
          ...a,
          reason: "PUBLISHED sans verifiedBy",
        })),
        wikidataAuto,
        noSource,
        enquetes,
        orphanDecisions: orphans,
      },
      null,
      2
    )
  );
  console.log("\nJSON écrit : data/affairs-compliance-audit.json");

  await db.$disconnect();

  if (process.argv.includes("--fail-on-leak")) {
    // Écarts bloquants : une affaire visible du public doit avoir une
    // validation humaine tracée et au moins une source vérifiable.
    const leaks =
      summary.publishedSansVerifiedBy +
      summary.publishedSansSource +
      summary.issuesFavorablesDansAgregatACharge;

    if (leaks > 0) {
      console.error(
        `\n✗ ${leaks} non-conformité(s) bloquante(s) : ` +
          `${summary.publishedSansVerifiedBy} publiée(s) sans verifiedBy, ` +
          `${summary.publishedSansSource} sans source, ` +
          `${summary.issuesFavorablesDansAgregatACharge} issue(s) favorable(s) dans l'agrégat à charge.`
      );
      console.error(
        "  Remédiation : npm run remediate:unverified -- --confirm (dépublie vers DRAFT)."
      );
      process.exit(1);
    }
    console.log("\n✓ Aucune affaire publiée sans validation humaine tracée.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
