import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let loadPresidentialReaderGuideIndex: typeof import("../presidential-reader-guides").loadPresidentialReaderGuideIndex;
let loadPresidentialReaderGuideSummaries: typeof import("../presidential-reader-guides").loadPresidentialReaderGuideSummaries;

const SLUG = "reader-guides-summary";

describeIfDisposableDb("résumé des repères de lecture présidentiels", () => {
  let electionId: string;
  let guideId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ loadPresidentialReaderGuideIndex, loadPresidentialReaderGuideSummaries } =
      await import("../presidential-reader-guides"));
    const { createMeasure, reviewMeasureRevision, publishMeasureRevision } =
      await import("@/lib/measures/transitions");

    const election = await db.election.create({
      data: {
        slug: SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection de test (repères)",
      },
    });
    electionId = election.id;

    const politician = await db.politician.create({
      data: {
        slug: `${SLUG}-same-politician`,
        firstName: "Même",
        lastName: "Politique",
        fullName: "Même Politique",
        publicationStatus: "PUBLISHED",
      },
    });
    const first = await db.candidacy.create({
      data: {
        electionId,
        politicianId: politician.id,
        candidateName: "Même Politique 1",
        status: "DECLARE",
        sourceUrl: "https://example.org/source-1",
        sourceLabel: "Source 1",
      },
    });
    const second = await db.candidacy.create({
      data: {
        electionId,
        politicianId: politician.id,
        candidateName: "Même Politique 2",
        status: "DECLARE",
        sourceUrl: "https://example.org/source-2",
        sourceLabel: "Source 2",
      },
    });
    await db.candidacyPresidential.createMany({
      data: [first.id, second.id].map((candidacyId) => ({
        candidacyId,
        publicationStatus: "PUBLISHED" as const,
      })),
    });

    const guide = await db.measureReaderGuide.create({
      data: {
        slug: `${SLUG}-guide`,
        label: "Guide de test",
        definition:
          "Une définition suffisamment longue pour être indexable et vérifier le résumé public.",
        aliases: [],
        sourceKind: "OFFICIAL_INSTITUTION",
        sourceUrl: "https://example.org/guide",
        sourceLabel: "Source du guide",
        sourcePublisher: "Institution de test",
        publicationStatus: "PUBLISHED",
        reviewedAt: new Date("2026-08-31T08:00:00Z"),
        reviewedBy: "fixture",
      },
    });
    guideId = guide.id;

    for (const [index, candidacy] of [first, second].entries()) {
      const seeded = await createMeasure({
        politicianId: politician.id,
        electionId,
        candidacyId: candidacy.id,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: "TRANSPORTS",
        precedingMeasureId: null,
        revision: {
          text: `Mesure repère ${index}`,
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
            url: `https://example.org/measure-${index}`,
            page: null,
            publishedAt: new Date("2027-01-01T00:00:00Z"),
          },
        ],
      });
      await reviewMeasureRevision({ ...seeded, reviewedBy: "fixture" });
      await publishMeasureRevision(seeded);
      await db.measureRevisionReaderGuide.create({
        data: {
          revisionId: seeded.revisionId,
          guideId,
          term: "guide de test",
          normalizedTerm: `guide-de-test-${index}`,
          evidenceSpan: "guide de test",
          reason: "Mention explicitement rattachée par la fixture.",
          confidence: 1,
          status: "APPROVED",
          method: "MANUAL",
          detectorVersion: "fixture",
          reviewedAt: new Date("2027-01-02T00:00:00Z"),
          reviewedBy: "fixture",
        },
      });
    }
  });

  afterAll(async () => {
    await db.measureReaderGuide.delete({ where: { id: guideId } });
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.delete({ where: { id: electionId } });
    await db.$disconnect();
  });

  it("conserve le nombre de mesures et déduplique les candidatures par politique", async () => {
    const [index, summaries] = await Promise.all([
      loadPresidentialReaderGuideIndex(electionId),
      loadPresidentialReaderGuideSummaries(electionId),
    ]);

    expect(index).toHaveLength(1);
    expect(summaries).toHaveLength(1);
    const indexGuide = index[0];
    const summary = summaries[0];
    expect(indexGuide).toBeDefined();
    expect(summary).toBeDefined();
    expect(summary).toMatchObject({
      slug: indexGuide!.slug,
      measureCount: indexGuide!.measures.length,
      candidateCount: indexGuide!.candidateCount,
      indexable: indexGuide!.indexable,
    });
    expect(indexGuide!.measures).toHaveLength(2);
    expect(indexGuide!.candidateCount).toBe(1);
    expect(summary!.candidateCount).toBe(1);
  });
});
