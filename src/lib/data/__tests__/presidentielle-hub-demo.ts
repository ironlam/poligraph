import { assertDisposableTestDb } from "@/test/disposable-db";

/**
 * Seeds a fictional demo corpus for the presidential 2027 hub and its two downstream surfaces
 * (the themes index and a subject page), so all three can be reviewed in a browser (responsive +
 * axe) in one pass.
 *
 * It lives in a __tests__ folder on purpose: it writes `publicationStatus: "PUBLISHED"` directly on
 * CandidacyPresidential, which has no transition of its own, so that literal belongs where the
 * publication guard allows it, alongside the integration fixtures. Modeled on
 * `presidentielle-subject-demo.ts` (the subject-page-only counterpart) and on
 * `hub-fixture.ts`/`themes-index-fixture.ts` (the transition + extension patterns), consumed by
 * `scripts/seed-presidentielle-hub-demo.ts`.
 *
 * The corpus has three parts, each proving a different gate:
 * - the field: two sourced candidacies (PRESSENTI, ENVISAGE), no `CandidacyPresidential` extension
 *   at all. The hub field shows the whole race, not just published fiches, so both must surface
 *   from `getHubCandidacyField`.
 * - a publishable subject page: two candidacies with a PUBLISHED extension, each defending one
 *   LOGEMENT_URBANISME measure. That clears the page-sujet gate (2 candidacies with a verified
 *   measure), so `hubPublishable` is true and `/sujets/logement-urbanisme` renders the open state.
 * - a subject page under threshold: one candidacy with a PUBLISHED extension defending one
 *   NUMERIQUE_TECH measure. One is short of the gate, so `/sujets/numerique-tech` renders the
 *   closed state (`SubjectGate`).
 *
 * assertDisposableTestDb() is the safety net: `.env` and `.env.prod` share the same database, so an
 * ungated run would fabricate candidacies and measures in production.
 */

const ELECTION_SLUG = "presidentielle-2027";
const THEME_LOGEMENT = "LOGEMENT_URBANISME" as const;
const THEME_NUMERIQUE = "NUMERIQUE_TECH" as const;

export async function seedPresidentielleHubDemo(
  db: typeof import("@/lib/db").db
): Promise<{ electionId: string }> {
  assertDisposableTestDb();

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

  async function politician(name: string) {
    const slug = `presidentielle-hub-demo-${name.toLowerCase()}`;
    return db.politician.create({
      data: {
        slug,
        firstName: "Candidat·e",
        lastName: name,
        fullName: `Candidat·e ${name}`,
        publicationStatus: "PUBLISHED",
      },
    });
  }

  async function sourcedCandidacy(name: string, status: "PRESSENTI" | "ENVISAGE"): Promise<string> {
    const pol = await politician(name);
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: pol.id,
        candidateName: `Candidat·e ${name}`,
        status,
        sourceUrl: "https://example.org/rumeur",
        sourceLabel: "Presse",
      },
    });
    return candidacy.id;
  }

  async function publishedCandidacyWithMeasure(
    name: string,
    theme: typeof THEME_LOGEMENT | typeof THEME_NUMERIQUE,
    text: string
  ): Promise<string> {
    const pol = await politician(name);
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: pol.id,
        candidateName: `Candidat·e ${name}`,
        status: "DECLARE",
        sourceUrl: "https://example.org/annonce",
        sourceLabel: "Discours de déclaration",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candidacy.id, publicationStatus: "PUBLISHED", slogan: `Slogan ${name}` },
    });

    const seeded = await createMeasure({
      politicianId: pol.id,
      electionId: election.id,
      candidacyId: candidacy.id,
      programEditionId: null,
      attribution: "PERSONAL",
      theme,
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

    return candidacy.id;
  }

  // The field: sourced, no extension, visible at the hub before any fiche is published.
  await sourcedCandidacy("A", "PRESSENTI");
  await sourcedCandidacy("B", "ENVISAGE");

  // The publishable subject page: two published candidacies each defend a Logement measure.
  await publishedCandidacyWithMeasure(
    "C",
    THEME_LOGEMENT,
    "Encadrer les loyers dans les zones tendues."
  );
  await publishedCandidacyWithMeasure(
    "D",
    THEME_LOGEMENT,
    "Construire 500 000 logements sociaux sur le quinquennat."
  );

  // The subject page below threshold: only one published candidacy defends a Numérique measure.
  await publishedCandidacyWithMeasure(
    "E",
    THEME_NUMERIQUE,
    "Créer un service public du numérique responsable."
  );

  return { electionId: election.id };
}
