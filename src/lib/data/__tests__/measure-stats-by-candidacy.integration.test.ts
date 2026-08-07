import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let getPublicMeasureStatsByCandidacy: typeof import("../measures").getPublicMeasureStatsByCandidacy;

const SLUG = "stats-by-candidacy";

/**
 * These counters feed a PUBLICATION GATE (`isFicheCandidatPublishable`), so the two ways they could
 * be wrong both open a public surface that nothing justifies:
 *
 * - counting a measure carried by a DRAFT-extension candidacy, which no public page renders;
 * - counting a PRIMARY source that belongs to an unpublished draft revision rather than to the
 *   revision the public actually sees.
 */
describeIfDisposableDb("getPublicMeasureStatsByCandidacy", () => {
  let publishedCandidacyId: string;
  let draftExtensionCandidacyId: string;
  let secondarySourceCandidacyId: string;
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getPublicMeasureStatsByCandidacy } = await import("../measures"));
    const { createMeasure, reviewMeasureRevision, publishMeasureRevision, draftMeasureRevision } =
      await import("@/lib/measures/transitions");

    const election = await db.election.create({
      data: {
        slug: SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection de test (compteurs)",
      },
    });
    electionId = election.id;

    async function candidacy(name: string, publicationStatus: "PUBLISHED" | "DRAFT") {
      const pol = await db.politician.create({
        data: {
          slug: `${SLUG}-${name}`,
          firstName: name,
          lastName: "Fixture",
          fullName: `${name} Fixture`,
        },
      });
      const c = await db.candidacy.create({
        data: {
          electionId: election.id,
          politicianId: pol.id,
          candidateName: `${name} Fixture`,
          status: "DECLARE",
          sourceUrl: "https://example.org/source",
          sourceLabel: "Source",
        },
      });
      await db.candidacyPresidential.create({
        data: { candidacyId: c.id, publicationStatus },
      });
      return { candidacyId: c.id, politicianId: pol.id };
    }

    async function publishOne(options: {
      candidacyId: string;
      politicianId: string;
      theme: "LOGEMENT_URBANISME" | "SANTE";
      tier: "PRIMARY" | "SECONDARY";
      text: string;
    }) {
      const { measureId, revisionId } = await createMeasure({
        politicianId: options.politicianId,
        electionId: election.id,
        candidacyId: options.candidacyId,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: options.theme,
        precedingMeasureId: null,
        revision: {
          text: `Mesure de test ${options.text}`,
          precision: null,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          extractionMethod: "MANUAL",
          extractionConfidence: null,
          extractorVersion: null,
        },
        sources: [
          {
            sourceKind: "PROGRAMME_PARTI",
            tier: options.tier,
            url: `https://example.org/${options.text}`,
            page: null,
            publishedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      });
      await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "test" });
      await publishMeasureRevision({ measureId, revisionId });
      return measureId;
    }

    const published = await candidacy("published", "PUBLISHED");
    publishedCandidacyId = published.candidacyId;
    await publishOne({ ...published, theme: "LOGEMENT_URBANISME", tier: "PRIMARY", text: "a" });
    await publishOne({ ...published, theme: "SANTE", tier: "SECONDARY", text: "b" });

    const draftExt = await candidacy("draft-ext", "DRAFT");
    draftExtensionCandidacyId = draftExt.candidacyId;
    await publishOne({ ...draftExt, theme: "LOGEMENT_URBANISME", tier: "PRIMARY", text: "c" });

    // The revision trap: published revision carries a SECONDARY source, an unpublished draft
    // carries a PRIMARY one.
    const secondary = await candidacy("secondary", "PUBLISHED");
    secondarySourceCandidacyId = secondary.candidacyId;
    const measureId = await publishOne({
      ...secondary,
      theme: "LOGEMENT_URBANISME",
      tier: "SECONDARY",
      text: "d",
    });
    await draftMeasureRevision({
      measureId,
      revision: {
        text: "Version brouillon avec une source primaire",
        precision: null,
        validFrom: new Date("2026-02-01T00:00:00.000Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "PROGRAMME_PARTI",
          tier: "PRIMARY",
          url: "https://example.org/draft-primary",
          page: null,
          publishedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await db.measure.deleteMany({ where: { electionId } });
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  it("compte les mesures publiées et les sujets couverts", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.measureCount).toBe(2);
    expect(stats.themesCoveredCount).toBe(2);
  });

  it("compte une seule mesure à source primaire quand l'autre est secondaire", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.primarySourceMeasureCount).toBe(1);
  });

  it("rend une date de dernière revue", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(publishedCandidacyId);
    expect(stats.lastReviewedAt).toBeInstanceOf(Date);
  });

  it("ne compte rien pour une candidature à extension DRAFT", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(draftExtensionCandidacyId);
    expect(stats.measureCount).toBe(0);
    expect(stats.primarySourceMeasureCount).toBe(0);
    expect(stats.lastReviewedAt).toBeNull();
  });

  it("ignore une source primaire portée par un brouillon non publié", async () => {
    const stats = await getPublicMeasureStatsByCandidacy(secondarySourceCandidacyId);
    expect(stats.measureCount).toBe(1);
    expect(stats.primarySourceMeasureCount).toBe(0);
  });
});
