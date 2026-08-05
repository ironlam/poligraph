import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import {
  draftInput,
  publishSeededMeasure,
  seedMeasureWithDraft,
} from "@/lib/measures/__tests__/helpers";

// Deferred: both `../measures` and the transitions import `@/lib/db` as a value, which
// throws at module load without DATABASE_URL.
let db: typeof import("@/lib/db").db;
let reads: typeof import("../measures");
let transitions: typeof import("@/lib/measures/transitions");

describeIfDisposableDb("public measure filter", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    reads = await import("../measures");
    transitions = await import("@/lib/measures/transitions");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("hides a PUBLISHED measure whose pointed revision is not reviewed", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    // Built directly in the database on purpose: no public call can produce this state,
    // which is exactly why the filter must not trust publicationStatus alone.
    await db.measure.update({
      where: { id: measureId },
      data: { publicationStatus: "PUBLISHED", publishedRevisionId: revisionId },
    });

    expect(await reads.getPublicMeasure(measureId)).toBeNull();
  });

  it("hides a PUBLISHED measure whose pointed revision has no publishedAt", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { reviewedAt: new Date(), reviewedBy: "relecteur" },
    });
    await db.measure.update({
      where: { id: measureId },
      data: { publicationStatus: "PUBLISHED", publishedRevisionId: revisionId },
    });

    expect(await reads.getPublicMeasure(measureId)).toBeNull();
  });

  it("hides a PUBLISHED measure whose pointed revision is superseded", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureRevision.update({
      where: { id: revisionId },
      data: { supersededAt: new Date() },
    });

    expect(await reads.getPublicMeasure(measureId)).toBeNull();
  });

  it("hides a PUBLISHED measure whose pointed revision has no source", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureSource.deleteMany({ where: { measureRevisionId: revisionId } });

    // An unsourced measure on a public page is exactly what this project exists not to
    // publish.
    expect(await reads.getPublicMeasure(measureId)).toBeNull();
  });

  it("hides a depublished measure", async () => {
    const { measureId } = await publishSeededMeasure();
    await transitions.depublishMeasure({ measureId, reason: "Erreur factuelle." });

    expect(await reads.getPublicMeasure(measureId)).toBeNull();
  });

  it("returns a published measure with its sources and qualifications", async () => {
    const { measureId } = await publishSeededMeasure();

    const measure = await reads.getPublicMeasure(measureId);

    expect(measure).not.toBeNull();
    expect(measure?.sources.length).toBeGreaterThan(0);
    expect(measure?.withdrawal).toBeNull();
  });

  it("moderation reads see what the public filter hides", async () => {
    const { measureId } = await seedMeasureWithDraft();

    expect(await reads.getPublicMeasure(measureId)).toBeNull();
    const moderation = await reads.getMeasureForModeration(measureId);
    expect(moderation?.revisions).toHaveLength(1);
  });
});

describeIfDisposableDb("withdrawn measures in the reads", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    reads = await import("../measures");
    transitions = await import("@/lib/measures/transitions");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function withdrawn() {
    const seeded = await publishSeededMeasure();
    await transitions.withdrawMeasure({
      measureId: seeded.measureId,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Le Monde, 1er mars 2027",
    });
    return seeded;
  }

  it("keeps a withdrawn measure visible on its detail read, with its withdrawal state", async () => {
    const { measureId } = await withdrawn();

    const measure = await reads.getPublicMeasure(measureId);

    // Not a filter: erasing a proposal a candidate carried then dropped would delete
    // information that matters. The page shows the withdrawal, it does not hide the row.
    expect(measure).not.toBeNull();
    expect(measure?.withdrawal?.withdrawnAt).not.toBeNull();
    expect(measure?.withdrawal?.sourceLabel).toBe("Le Monde, 1er mars 2027");
    expect(measure?.withdrawal?.sourceUrl).toBe("https://example.org/retrait");
  });

  it("excludes a withdrawn measure from the lists by default", async () => {
    const { measureId } = await withdrawn();
    const election = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { electionId: true, theme: true },
    });

    const byElection = await reads.getPublicMeasuresByElection(election.electionId);
    const byTheme = await reads.getPublicMeasuresByTheme(election.electionId, election.theme);

    // A list answers "which proposals are currently defended". Showing a dropped one there
    // states something false about the candidate, and a caller who forgets the option must
    // get the safe answer.
    expect(byElection.map((m) => m.id)).not.toContain(measureId);
    expect(byTheme.map((m) => m.id)).not.toContain(measureId);
  });

  it("returns it when the caller asks for withdrawn measures explicitly", async () => {
    const { measureId } = await withdrawn();
    const election = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { electionId: true },
    });

    const all = await reads.getPublicMeasuresByElection(election.electionId, {
      includeWithdrawn: true,
    });

    expect(all.map((m) => m.id)).toContain(measureId);
  });

  it("publishes a correction of a withdrawn measure without reactivating it", async () => {
    const { measureId } = await withdrawn();
    const before = await db.measure.findUniqueOrThrow({ where: { id: measureId } });

    // Publishing a revision is an EDITORIAL act, withdrawing is the candidate's POLITICAL
    // act. A historical correction must stay possible, and must never reactivate the
    // proposal.
    const { revisionId: correction } = await transitions.draftMeasureRevision(
      draftInput(measureId, "Encadrer les loyers dans les zones tendues, formulation corrigée.")
    );
    await transitions.reviewMeasureRevision({
      measureId,
      revisionId: correction,
      reviewedBy: "relecteur",
    });
    await transitions.publishMeasureRevision({ measureId, revisionId: correction });

    const after = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    const measure = await reads.getPublicMeasure(measureId);
    const doc = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // The public revision and the index follow the correction...
    expect(after.publishedRevisionId).toBe(correction);
    expect(measure?.text).toContain("formulation corrigée");
    expect(doc.sourceRevisionId).toBe(correction);
    expect(doc.body).toContain("formulation corrigée");

    // ...and the three withdrawal fields are byte for byte what they were.
    expect(after.withdrawnAt).toStrictEqual(before.withdrawnAt);
    expect(after.withdrawnSourceUrl).toBe(before.withdrawnSourceUrl);
    expect(after.withdrawnSourceLabel).toBe(before.withdrawnSourceLabel);
    expect(measure?.withdrawal).not.toBeNull();
  });

  it("keeps a withdrawn measure in the search index, not hidden from it", async () => {
    const { measureId } = await withdrawn();

    const doc = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // The search keeps withdrawn measures; marking them visibly is the interface's job.
    // Dropping them from the index would make a proposal a candidate publicly carried
    // unfindable.
    expect(doc.visibility).toBe("PUBLIC");
  });
});

describeIfDisposableDb("getRevisionInForceAt", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    reads = await import("../measures");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns nothing before the first published revision", async () => {
    const { measureId } = await publishSeededMeasure();

    expect(
      await reads.getRevisionInForceAt(measureId, new Date("2020-01-01T00:00:00Z"))
    ).toBeNull();
  });

  it("returns the published revision after its date", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();

    const inForce = await reads.getRevisionInForceAt(measureId, new Date("2027-06-01T00:00:00Z"));

    expect(inForce?.id).toBe(revisionId);
  });

  it("never returns a draft that was never published", async () => {
    const { measureId, revisionId: published } = await publishSeededMeasure();
    // validFrom AFTER the published revision's (2027-01-01) and before the query date.
    // The plan put it in 2020 and explained that "the draft has the earliest validFrom, so
    // an ordering without the publishedAt condition would pick it". That is backwards: with
    // ORDER BY validFrom DESC the earliest sorts LAST, so the published revision won either
    // way and the test stayed green with the guard removed. It has to be the most recent
    // candidate to be the one a missing guard would select.
    const draft = await db.measureRevision.create({
      data: {
        measureId,
        text: "Brouillon jamais publié.",
        validFrom: new Date("2027-03-01T00:00:00Z"),
        extractionMethod: "MANUAL",
      },
    });

    const inForce = await reads.getRevisionInForceAt(measureId, new Date("2027-06-01T00:00:00Z"));

    // Both assertions: "not the draft" alone would also pass on null, which is not the
    // behaviour wanted here.
    expect(inForce?.id).not.toBe(draft.id);
    expect(inForce?.id).toBe(published);
  });
});
