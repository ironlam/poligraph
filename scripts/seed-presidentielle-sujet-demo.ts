#!/usr/bin/env tsx
/**
 * Seeds a fictional, publishable subject page for the presidential 2027 hub, so the public route
 * /presidentielle-2027/sujets/logement-urbanisme can be reviewed in a browser (responsive + axe).
 *
 * Refuses to run against anything but the disposable container, and that refusal is the point:
 * `.env` and `.env.prod` point at the same Supabase database, so an ungated run with the default
 * environment would write fabricated candidacies and measures into production.
 *
 * Usage, with the container from docker-compose.test-search.yml running and its schema pushed:
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx tsx scripts/seed-presidentielle-sujet-demo.ts
 */
import { assertDisposableTestDb } from "@/test/disposable-db";

const ELECTION_SLUG = "presidentielle-2027";
const THEME = "LOGEMENT_URBANISME" as const;

async function main(): Promise<void> {
  // First statement, before any import that opens a connection: the guard is the safety net.
  assertDisposableTestDb();

  const { db } = await import("@/lib/db");
  const { createMeasure, reviewMeasureRevision, publishMeasureRevision } =
    await import("@/lib/measures/transitions");

  const election = await db.election.create({
    data: {
      slug: ELECTION_SLUG,
      type: "PRESIDENTIELLE",
      scope: "NATIONAL",
      title: "Présidentielle 2027",
    },
  });

  async function publishedCandidate(name: string, text: string, sourced: boolean): Promise<void> {
    const slug = `demo-${name.toLowerCase()}`;
    const politician = await db.politician.create({
      data: { slug, firstName: name, lastName: "Démo", fullName: `${name} Démo` },
    });
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: politician.id,
        candidateName: `${name} Démo`,
        status: "DECLARE",
        sourceUrl: sourced ? "https://example.org/annonce" : null,
        sourceLabel: sourced ? "Discours de déclaration" : null,
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candidacy.id, publicationStatus: "PUBLISHED", slogan: `Slogan ${name}` },
    });
    const seeded = await createMeasure({
      politicianId: politician.id,
      electionId: election.id,
      candidacyId: candidacy.id,
      programEditionId: null,
      attribution: "PERSONAL",
      theme: THEME,
      precedingMeasureId: null,
      revision: {
        text,
        precision: "OBJECTIF_SANS_CHIFFRE",
        validFrom: new Date("2027-01-01T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "DISCOURS_CAMPAGNE",
          tier: "PRIMARY",
          url: "https://example.org/meeting",
          page: null,
          publishedAt: new Date("2027-01-01T00:00:00Z"),
        },
      ],
    });
    await reviewMeasureRevision({ ...seeded, reviewedBy: "relecteur" });
    await publishMeasureRevision(seeded);
  }

  // Two candidacies with a defended measure clear the page-sujet gate; a third has none (absence).
  await publishedCandidate("Alix", "Encadrer les loyers dans les zones tendues.", true);
  await publishedCandidate(
    "Bruno",
    "Construire 500 000 logements sociaux sur le quinquennat.",
    true
  );
  const chloePol = await db.politician.create({
    data: { slug: "demo-chloe", firstName: "Chloé", lastName: "Démo", fullName: "Chloé Démo" },
  });
  const chloe = await db.candidacy.create({
    data: {
      electionId: election.id,
      politicianId: chloePol.id,
      candidateName: "Chloé Démo",
      status: "DECLARE",
      sourceUrl: "https://example.org/annonce",
      sourceLabel: "Discours de déclaration",
    },
  });
  await db.candidacyPresidential.create({
    data: { candidacyId: chloe.id, publicationStatus: "PUBLISHED" },
  });

  console.log(`[seed:presidentielle-sujet] élection ${ELECTION_SLUG} (${election.id})`);
  console.log(`[seed:presidentielle-sujet] 3 candidatures publiées, 2 avec mesure sur ${THEME}`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
