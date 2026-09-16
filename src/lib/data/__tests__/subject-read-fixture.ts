import { assertDisposableTestDb } from "@/test/db-guard";

export async function seedSubjectReads(
  db: typeof import("@/lib/db").db,
  slug: string,
  candidacies: number,
  measuresPerCandidate: number
) {
  assertDisposableTestDb();
  const transitions = await import("@/lib/measures/transitions");
  const election = await db.election.create({
    data: { slug, type: "PRESIDENTIELLE", scope: "NATIONAL", title: "Fixture lectures sujet" },
  });
  const subtopic = await db.measureSubtopic.create({
    data: { slug, label: "Sous-thème", description: "Fixture", theme: "SANTE", active: true },
  });
  const guide = await db.measureReaderGuide.create({
    data: {
      slug,
      label: "Terme de fixture",
      definition: "Définition synthétique. ".repeat(30),
      sourceKind: "OFFICIAL_INSTITUTION",
      sourceUrl: "https://example.org/guide",
      sourceLabel: "Fixture",
      sourcePublisher: "Fixture",
      publicationStatus: "PUBLISHED",
      reviewedAt: new Date("2026-01-01"),
      reviewedBy: "fixture",
    },
  });
  const candidates = [];
  for (let c = 0; c < candidacies; c++) {
    const politician = await db.politician.create({
      data: {
        slug: `${slug}-${c}`,
        firstName: "Fixture",
        lastName: `Personne${c}`,
        fullName: `Fixture Personne${c}`,
      },
    });
    const candidate = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: politician.id,
        candidateName: politician.fullName,
        status: "DECLARE",
        sourceUrl: "https://example.org/candidate",
        sourceLabel: "Fixture",
        presidentialData: { create: { publicationStatus: "PUBLISHED" } },
      },
    });
    candidates.push({ ...candidate, slug: politician.slug });
    for (let m = 0; m < measuresPerCandidate; m++) {
      const seeded = await transitions.createMeasure({
        politicianId: politician.id,
        candidacyId: candidate.id,
        electionId: election.id,
        programEditionId: null,
        attribution: "PERSONAL",
        theme: "SANTE",
        precedingMeasureId: null,
        revision: {
          text: `Proposition synthétique ${c}-${m}.`,
          details: "Contexte synthétique. ".repeat(40),
          precision: "OBJECTIF_SANS_CHIFFRE",
          validFrom: new Date("2026-01-01"),
          extractionMethod: "MANUAL",
          extractionConfidence: null,
          extractorVersion: null,
        },
        sources: [
          {
            sourceKind: "DISCOURS_CAMPAGNE",
            tier: "SECONDARY",
            url: "https://example.org/secondary",
            page: null,
            publishedAt: new Date("2026-01-01"),
          },
        ],
      });
      await transitions.reviewMeasureRevision({ ...seeded, reviewedBy: "fixture" });
      await transitions.publishMeasureRevision(seeded);
      await db.measure.update({
        where: { id: seeded.measureId },
        data: {
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, m)),
          ...(m === 1
            ? {
                withdrawnAt: new Date("2026-02-01"),
                withdrawnSourceUrl: "https://example.org/retrait",
              }
            : {}),
        },
      });
      await db.measureRevision.update({
        where: { id: seeded.revisionId },
        data: {
          evidenceSnapshot: { synthetic: "x".repeat(4096) },
          sources: {
            create: {
              sourceKind: "PROGRAMME_CANDIDAT",
              tier: "PRIMARY",
              url: "https://example.org/primary",
              publishedAt: new Date("2026-01-02"),
            },
          },
          qualifications: {
            create: {
              kind: "FINANCEMENT_NON_PRECISE",
              label: "Qualification de fixture",
              rationale: "Explication synthétique",
              assessedAt: new Date("2026-01-01"),
              assessedBy: "fixture",
            },
          },
          subtopics: {
            create: {
              subtopicId: subtopic.id,
              status: "APPROVED",
              method: "MANUAL",
              classifierVersion: "fixture",
              taxonomyVersion: "fixture",
            },
          },
          readerGuideMentions: {
            create: {
              guideId: guide.id,
              term: "Terme",
              normalizedTerm: "terme",
              evidenceSpan: "Terme",
              reason: "Fixture",
              confidence: 1,
              status: "APPROVED",
              method: "MANUAL",
              detectorVersion: "fixture",
            },
          },
        },
      });
    }
  }
  return { election, candidates };
}
