import type { ThemeCategory } from "@/generated/prisma";

/**
 * Seeds the fixture for the `hub` read authorities test.
 *
 * Two populations coexist on purpose:
 * - Alpha and Bravo carry a PUBLISHED `CandidacyPresidential` extension plus a defended
 *   LOGEMENT_URBANISME measure each, so the subject page reaches its two-candidacy gate and
 *   `getHubMeasureContext` reports `hubPublishable: true`.
 * - Charlie is PRESSENTI, has a complete source (`sourceUrl` + `sourceLabel`) and NO extension
 *   at all. The hub field shows the whole race, not just published fiches, so Charlie must
 *   still surface from `getHubCandidacyField`.
 * - Delta has a source URL but no `sourceLabel`: an incomplete source, which must stay absent
 *   from the field.
 *
 * Statuses are assigned so that alphabetical order (by `candidateName`) and status order (by
 * `status`, alphabetically DECLARE < ENVISAGE < PRESSENTI < RETIRE) disagree: Alpha is
 * PRESSENTI, Bravo is DECLARE, Charlie is ENVISAGE. Sorting by name gives Alpha, Bravo,
 * Charlie; sorting by status gives Bravo, Charlie, Alpha. This is what makes the "sorted by
 * status instead of name" ablation actually turn the ordering test red.
 */

const THEME_LOGEMENT: ThemeCategory = "LOGEMENT_URBANISME";

export async function seedHubFixture(
  db: typeof import("@/lib/db").db,
  options: { electionSlug: string }
): Promise<string> {
  const { createMeasure, reviewMeasureRevision, publishMeasureRevision } =
    await import("@/lib/measures/transitions");

  const election = await db.election.create({
    data: {
      slug: options.electionSlug,
      type: "PRESIDENTIELLE",
      scope: "NATIONAL",
      title: "Élection de test — hub",
    },
  });

  async function politician(name: string) {
    return db.politician.create({
      data: {
        slug: `${options.electionSlug}-${name.toLowerCase()}`,
        firstName: name,
        lastName: "Fixture",
        fullName: `${name} Fixture`,
      },
    });
  }

  async function candidacyWithPublishedExtension(
    name: string,
    status: "PRESSENTI" | "DECLARE"
  ): Promise<{ candidacyId: string; politicianId: string }> {
    const pol = await politician(name);
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: pol.id,
        candidateName: `${name} Fixture`,
        status,
        sourceUrl: "https://example.org/source",
        sourceLabel: "Source",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candidacy.id, publicationStatus: "PUBLISHED" },
    });
    return { candidacyId: candidacy.id, politicianId: pol.id };
  }

  async function publishMeasure(
    politicianId: string,
    candidacyId: string,
    theme: ThemeCategory,
    text: string
  ) {
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

  const alpha = await candidacyWithPublishedExtension("Alpha", "PRESSENTI");
  const bravo = await candidacyWithPublishedExtension("Bravo", "DECLARE");

  await publishMeasure(
    alpha.politicianId,
    alpha.candidacyId,
    THEME_LOGEMENT,
    "Encadrer les loyers dans les zones tendues."
  );
  await publishMeasure(
    bravo.politicianId,
    bravo.candidacyId,
    THEME_LOGEMENT,
    "Construire 500 000 logements sociaux sur le quinquennat."
  );

  // Charlie: pressenti, source complète, SANS extension CandidacyPresidential. Doit apparaître
  // au champ du hub (le champ ≠ les fiches publiées).
  const charlie = await politician("Charlie");
  await db.candidacy.create({
    data: {
      electionId: election.id,
      politicianId: charlie.id,
      candidateName: "Charlie Fixture",
      status: "ENVISAGE",
      sourceUrl: "https://example.org/rumeur",
      sourceLabel: "Presse",
    },
  });

  // Delta: source incomplète (pas de sourceLabel). Doit rester absente du champ.
  const delta = await politician("Delta");
  await db.candidacy.create({
    data: {
      electionId: election.id,
      politicianId: delta.id,
      candidateName: "Delta Fixture",
      status: "ENVISAGE",
      sourceUrl: "https://example.org/rumeur-delta",
      sourceLabel: null,
    },
  });

  return election.id;
}
