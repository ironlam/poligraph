import type { ThemeCategory } from "@/generated/prisma";
import { assertDisposableTestDb } from "@/test/disposable-db";

/**
 * Seeds the fixture for the `themes-index` parity test.
 *
 * Modeled on `presidentielle-subject-demo.ts` and the setup of
 * `subject-page.integration.test.ts`: candidacies + `CandidacyPresidential` extensions +
 * measures created through the real transitions (`createMeasure`, `reviewMeasureRevision`,
 * `publishMeasureRevision`, `withdrawMeasure`). The literal `publicationStatus: "PUBLISHED"`
 * is deliberate here, in a `__tests__` file: `CandidacyPresidential` has no publishing
 * transition of its own.
 *
 * The population this builds is exactly the one the invariant under test cares about:
 * - Alpha and Bravo have a PUBLISHED extension, so they are in the subject-page population.
 * - Charlie has a DRAFT extension: its LOGEMENT_URBANISME measure is published, but the
 *   candidacy itself must never surface, and `themes-index` must not count it either.
 * - Alpha also carries a withdrawn LOGEMENT_URBANISME measure (documented but not defended)
 *   and a defended SANTE measure (to prove one candidacy short of the page-sujet gate on a
 *   different theme).
 */

const THEME_LOGEMENT: ThemeCategory = "LOGEMENT_URBANISME";
const THEME_SANTE: ThemeCategory = "SANTE";

export async function seedThemesIndexFixture(
  db: typeof import("@/lib/db").db,
  options: { electionSlug: string }
): Promise<string> {
  // Defense in depth: the callers of this fixture already gate on the disposable container,
  // but the fixture writes on its own, so it checks again rather than trusting them.
  assertDisposableTestDb();

  const { createMeasure, reviewMeasureRevision, publishMeasureRevision, withdrawMeasure } =
    await import("@/lib/measures/transitions");

  const election = await db.election.create({
    data: {
      slug: options.electionSlug,
      type: "PRESIDENTIELLE",
      scope: "NATIONAL",
      title: "Élection de test (index des sujets)",
    },
  });

  async function candidate(
    name: string,
    publicationStatus: "PUBLISHED" | "DRAFT"
  ): Promise<{ candidacyId: string; politicianId: string }> {
    const slug = `${options.electionSlug}-${name.toLowerCase()}`;
    const politician = await db.politician.create({
      data: { slug, firstName: name, lastName: "Fixture", fullName: `${name} Fixture` },
    });
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: politician.id,
        candidateName: `${name} Fixture`,
        status: "DECLARE",
        sourceUrl: "https://example.org/source",
        sourceLabel: "Source",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candidacy.id, publicationStatus },
    });
    return { candidacyId: candidacy.id, politicianId: politician.id };
  }

  async function publishMeasure(
    politicianId: string,
    candidacyId: string,
    theme: ThemeCategory,
    text: string
  ): Promise<{ measureId: string; revisionId: string }> {
    const seeded = await createMeasure({
      politicianId,
      electionId: election.id,
      candidacyId,
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
    await reviewMeasureRevision({ ...seeded, reviewedBy: "fixture" });
    await publishMeasureRevision(seeded);
    return seeded;
  }

  const alpha = await candidate("Alpha", "PUBLISHED");
  const bravo = await candidate("Bravo", "PUBLISHED");
  const charlie = await candidate("Charlie", "DRAFT");

  // Alpha: one defended LOGEMENT measure, one withdrawn LOGEMENT measure, one defended SANTE measure.
  await publishMeasure(
    alpha.politicianId,
    alpha.candidacyId,
    THEME_LOGEMENT,
    "Encadrer les loyers dans les zones tendues."
  );
  const withdrawn = await publishMeasure(
    alpha.politicianId,
    alpha.candidacyId,
    THEME_LOGEMENT,
    "Geler les loyers un an."
  );
  const before = await db.measure.findUniqueOrThrow({
    where: { id: withdrawn.measureId },
    select: { updatedAt: true },
  });
  await withdrawMeasure({
    measureId: withdrawn.measureId,
    withdrawnAt: new Date("2027-03-01T00:00:00Z"),
    sourceUrl: "https://example.org/retrait",
    sourceLabel: "Communiqué de retrait",
    expectedUpdatedAt: before.updatedAt,
  });
  await publishMeasure(
    alpha.politicianId,
    alpha.candidacyId,
    THEME_SANTE,
    "Recruter des soignants dans les hôpitaux publics."
  );

  // Bravo: one defended LOGEMENT measure, so the gate reaches two candidacies on this theme.
  await publishMeasure(
    bravo.politicianId,
    bravo.candidacyId,
    THEME_LOGEMENT,
    "Construire 500 000 logements sociaux sur le quinquennat."
  );

  // Charlie: a published LOGEMENT measure, but the extension is DRAFT, so it must never count.
  await publishMeasure(
    charlie.politicianId,
    charlie.candidacyId,
    THEME_LOGEMENT,
    "Mesure logement rattachée à une candidature non publiée."
  );

  return election.id;
}
