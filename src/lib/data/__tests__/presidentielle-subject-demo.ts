import { assertDisposableTestDb } from "@/test/disposable-db";

/**
 * Seeds a fictional, publishable subject page for the presidential 2027 hub.
 *
 * It lives in a __tests__ folder on purpose: it writes `publicationStatus: "PUBLISHED"` directly on
 * CandidacyPresidential, which has no transition of its own, so that literal belongs where the publication
 * guard allows it, alongside the integration fixtures. It is the demo counterpart of
 * `subject-page.integration.test.ts`, consumed by scripts/seed-presidentielle-sujet-demo.ts for a live
 * responsive/axe review.
 *
 * assertDisposableTestDb() is the safety net: `.env` and `.env.prod` share the same database, so an
 * ungated run would fabricate candidacies and measures in production.
 */

const ELECTION_SLUG = "presidentielle-2027";
const THEME = "LOGEMENT_URBANISME" as const;

export async function seedPresidentielleSubjectDemo(): Promise<{ electionId: string }> {
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

  async function publishedCandidate(name: string, text: string | null): Promise<void> {
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
        sourceUrl: "https://example.org/annonce",
        sourceLabel: "Discours de déclaration",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candidacy.id, publicationStatus: "PUBLISHED", slogan: `Slogan ${name}` },
    });

    if (text === null) return;

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
  await publishedCandidate("Alix", "Encadrer les loyers dans les zones tendues.");
  await publishedCandidate("Bruno", "Construire 500 000 logements sociaux sur le quinquennat.");
  await publishedCandidate("Chloé", null);

  return { electionId: election.id };
}
