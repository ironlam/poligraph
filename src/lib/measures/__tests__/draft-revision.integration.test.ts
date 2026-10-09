import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import {
  draftInput,
  publishSeededMeasure,
  seedMeasureWithDraft,
  withIndexingRejected,
} from "./helpers";

// Two deferred imports: `@/lib/db` throws at module load when DATABASE_URL is unset, and
// `../transitions` imports it as a value, so a static import of either fails the whole
// file instead of skipping the block.
let db: typeof import("@/lib/db").db;
let draftMeasureRevision: typeof import("../transitions").draftMeasureRevision;

describeIfDisposableDb("draftMeasureRevision", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ draftMeasureRevision } = await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("leaves at most one active draft after two successive calls", async () => {
    const { measureId } = await seedMeasureWithDraft();

    const first = await draftMeasureRevision(draftInput(measureId, "Deuxième version."));
    const second = await draftMeasureRevision(draftInput(measureId, "Troisième version."));

    const active = await db.measureRevision.findMany({
      where: { measureId, discardedAt: null, publishedAt: null },
      select: { id: true },
    });
    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });

    // The violation revision 1 of the plan produced: three drafts, none discarded, and an
    // orphan active draft on the very first audit run.
    expect(active.map((r) => r.id)).toEqual([second.revisionId]);
    expect(measure.latestRevisionId).toBe(second.revisionId);

    const abandoned = await db.measureRevision.findUniqueOrThrow({
      where: { id: first.revisionId },
    });
    expect(abandoned.discardedAt).not.toBeNull();
    expect(abandoned.reviewedBy).toBeNull();
  });

  it("ne remplace pas automatiquement un brouillon relu pendant une génération", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { reviewedAt: new Date(), reviewedBy: "relecteur" },
    });
    const input = draftInput(measureId, "Contexte régénéré qui ne doit pas survivre.");

    await expect(
      draftMeasureRevision({
        ...input,
        preserveEvidenceFromRevisionId: revisionId,
        revision: {
          ...input.revision,
          details: "Contexte régénéré qui ne doit pas remplacer la revue humaine.",
          extractionMethod: "AI_ASSISTED",
          extractorVersion: "mistral-small-latest:measure-context-v9",
        },
        generatedContext: {
          claims: [],
          evidenceUnitIds: [],
          generatedBy: "system",
          ipAddress: "unknown",
          model: "mistral-small-latest",
          promptVersion: "measure-context-v9",
          userAgent: "vitest",
        },
      })
    ).rejects.toThrow("Un brouillon relu ou modéré");

    const revisions = await db.measureRevision.findMany({ where: { measureId } });
    expect(revisions.map(({ id }) => id)).toEqual([revisionId]);
    expect(revisions[0]?.discardedAt).toBeNull();
    expect(revisions[0]?.reviewedAt).not.toBeNull();
  });

  it("does not discard the published revision when drafting a correction", async () => {
    const { measureId, revisionId: publishedId } = await seedMeasureWithDraft();

    // Simulates the published state without going through publishMeasureRevision, which
    // does not exist yet: what this test guards is the branch of draftMeasureRevision,
    // not the publication path.
    await db.measureRevision.update({
      where: { id: publishedId },
      data: { reviewedAt: new Date(), reviewedBy: "relecteur", publishedAt: new Date() },
    });
    await db.measure.update({
      where: { id: measureId },
      data: { publishedRevisionId: publishedId, publicationStatus: "PUBLISHED" },
    });

    await draftMeasureRevision(draftInput(measureId, "Correction en cours."));

    const published = await db.measureRevision.findUniqueOrThrow({ where: { id: publishedId } });
    const after = await db.measure.findUniqueOrThrow({ where: { id: measureId } });

    // Discarding the published revision here would depublish valid public content on
    // every correction, which is the effect two pointers exist to prevent.
    expect(published.discardedAt).toBeNull();
    expect(published.supersededAt).toBeNull();
    expect(after.publishedRevisionId).toBe(publishedId);
    expect(after.publicationStatus).toBe("PUBLISHED");
  });

  it("keeps the public document on the published revision while a draft is in flight", async () => {
    const { measureId, revisionId: publishedId } = await seedMeasureWithDraft();
    await db.measureRevision.update({
      where: { id: publishedId },
      data: { reviewedAt: new Date(), reviewedBy: "relecteur", publishedAt: new Date() },
    });
    await db.measure.update({
      where: { id: measureId },
      data: { publishedRevisionId: publishedId, publicationStatus: "PUBLISHED" },
    });
    // The index has to be re-derived after the hand-made publication above, otherwise
    // this test would be asserting against the document left by createMeasure.
    await draftMeasureRevision(draftInput(measureId, "Une reformulation invisible."));

    const document = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // The visible half of the same invariant: a correction in progress must not reach the
    // public index either. Asserting only on the pointers would leave the search free to
    // expose a draft.
    expect(document.visibility).toBe("PUBLIC");
    expect(document.sourceRevisionId).toBe(publishedId);
    expect(document.body).not.toContain("reformulation invisible");
  });

  it("rolls back the new draft and the discard when indexing fails", async () => {
    const { measureId, revisionId: original } = await seedMeasureWithDraft();

    await withIndexingRejected(async () => {
      await expect(
        draftMeasureRevision(draftInput(measureId, "Version qui ne doit pas survivre."))
      ).rejects.toThrow();
    });

    const revisions = await db.measureRevision.findMany({ where: { measureId } });
    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });

    // Two writes precede the indexing here, the discard of the previous draft and the
    // creation of the new one. Both must be gone: a partial rollback would leave the
    // original draft discarded with nothing to replace it.
    expect(revisions.map((r) => r.id)).toEqual([original]);
    expect(revisions[0]?.discardedAt).toBeNull();
    expect(measure.latestRevisionId).toBe(original);
  });

  it("refuses to draft on a measure that does not exist", async () => {
    await expect(draftMeasureRevision(draftInput("mesure-inexistante", "Texte."))).rejects.toThrow(
      /not found/i
    );
  });

  /** A published measure whose revision carries one approved subtopic and one approved guide. */
  async function seedEnrichedPublishedMeasure() {
    const seeded = await publishSeededMeasure();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subtopic = await db.measureSubtopic.create({
      data: {
        slug: `loyers-${suffix}`,
        label: "Loyers",
        description: "Niveau et encadrement des loyers.",
        theme: "LOGEMENT_URBANISME",
      },
    });
    const guide = await db.measureReaderGuide.create({
      data: {
        slug: `zone-tendue-${suffix}`,
        label: "Zone tendue",
        definition: "Définition écrite par un humain.",
        sourceKind: "OFFICIAL_INSTITUTION",
        sourceUrl: "https://example.org/zone-tendue",
        sourceLabel: "Service public",
        sourcePublisher: "Service public",
        publicationStatus: "PUBLISHED",
      },
    });
    await db.measureRevisionSubtopic.create({
      data: {
        revisionId: seeded.revisionId,
        subtopicId: subtopic.id,
        status: "APPROVED",
        method: "llm",
        classifierVersion: "test",
        taxonomyVersion: "test",
        reviewedAt: new Date("2027-01-02T00:00:00Z"),
        reviewedBy: "relecteur",
      },
    });
    await db.measureRevisionReaderGuide.create({
      data: {
        revisionId: seeded.revisionId,
        guideId: guide.id,
        term: "zones tendues",
        normalizedTerm: "zones tendues",
        evidenceSpan: "zones tendues",
        reason: "Notion administrative.",
        confidence: 0.9,
        status: "APPROVED",
        method: "llm",
        detectorVersion: "test",
        reviewedAt: new Date("2027-01-02T00:00:00Z"),
        reviewedBy: "relecteur",
      },
    });
    return { ...seeded, subtopicId: subtopic.id, guideId: guide.id };
  }

  it("reporte en suggestion les sous-thèmes et repères approuvés quand le texte change", async () => {
    const { measureId, subtopicId, guideId } = await seedEnrichedPublishedMeasure();

    const { revisionId } = await draftMeasureRevision(
      draftInput(measureId, "Encadrer strictement les loyers dans les zones tendues.")
    );

    const subtopics = await db.measureRevisionSubtopic.findMany({ where: { revisionId } });
    expect(subtopics).toEqual([
      expect.objectContaining({
        subtopicId,
        status: "SUGGESTED",
        reviewedBy: null,
        method: "carried-forward",
      }),
    ]);
    const guides = await db.measureRevisionReaderGuide.findMany({ where: { revisionId } });
    expect(guides).toEqual([
      expect.objectContaining({
        guideId,
        status: "SUGGESTED",
        reviewedBy: null,
        evidenceSpan: "zones tendues",
      }),
    ]);
  });

  it("garde l'approbation quand le texte est identique", async () => {
    const { measureId, subtopicId, guideId } = await seedEnrichedPublishedMeasure();

    const { revisionId } = await draftMeasureRevision(
      draftInput(measureId, "Encadrer les loyers dans les zones tendues.")
    );

    const subtopics = await db.measureRevisionSubtopic.findMany({ where: { revisionId } });
    expect(subtopics).toEqual([
      expect.objectContaining({ subtopicId, status: "APPROVED", reviewedBy: "relecteur" }),
    ]);
    const guides = await db.measureRevisionReaderGuide.findMany({ where: { revisionId } });
    expect(guides).toEqual([expect.objectContaining({ guideId, status: "APPROVED" })]);
  });

  it("ne reporte pas un repère dont l'extrait a disparu du nouveau texte", async () => {
    const { measureId, subtopicId } = await seedEnrichedPublishedMeasure();

    const { revisionId } = await draftMeasureRevision(
      draftInput(measureId, "Plafonner les loyers dans les grandes agglomérations.")
    );

    expect(await db.measureRevisionReaderGuide.count({ where: { revisionId } })).toBe(0);
    expect(await db.measureRevisionSubtopic.findMany({ where: { revisionId } })).toEqual([
      expect.objectContaining({ subtopicId, status: "SUGGESTED" }),
    ]);
  });
});
