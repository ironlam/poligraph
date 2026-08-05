import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedMeasureWithDraft } from "./helpers";

// Two deferred imports: `@/lib/db` throws at module load when DATABASE_URL is unset, and
// `../transitions` imports it as a value, so a static import of either fails the whole
// file instead of skipping the block.
let db: typeof import("@/lib/db").db;
let transitions: typeof import("../transitions");

describeIfDisposableDb("reviewMeasureRevision", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    transitions = await import("../transitions");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses a revision that belongs to another measure", async () => {
    const first = await seedMeasureWithDraft();
    const second = await seedMeasureWithDraft();

    // Without this check, reviewing the wrong id silently marks a foreign revision as
    // read, and the trace names a reviewer who never saw that text.
    await expect(
      transitions.reviewMeasureRevision({
        measureId: first.measureId,
        revisionId: second.revisionId,
        reviewedBy: "relecteur",
      })
    ).rejects.toThrow(/autre mesure/i);
  });

  it("refuses a discarded revision", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await transitions.discardMeasureRevision({ measureId, revisionId });

    await expect(
      transitions.reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" })
    ).rejects.toThrow(/abandonnée/i);
  });

  it("refuses an unidentified reviewer", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();

    // reviewedBy is free text for now (no user model in this repo), so an empty string
    // would produce a review with no accountable author.
    await expect(
      transitions.reviewMeasureRevision({ measureId, revisionId, reviewedBy: "   " })
    ).rejects.toThrow(/relecteur/i);
  });

  it("records the reviewer and the date", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();

    await transitions.reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" });

    const revision = await db.measureRevision.findUniqueOrThrow({ where: { id: revisionId } });
    expect(revision.reviewedBy).toBe("relecteur");
    expect(revision.reviewedAt).not.toBeNull();
    // Review is not publication: the measure stays invisible until publish runs.
    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publishedRevisionId).toBeNull();
    expect(measure.publicationStatus).toBe("DRAFT");
  });
});

describeIfDisposableDb("discardMeasureRevision", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    transitions = await import("../transitions");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses a revision that belongs to another measure", async () => {
    const first = await seedMeasureWithDraft();
    const second = await seedMeasureWithDraft();

    // The lock is taken on measureId while the update targets revisionId. Without an
    // ownership check, this call locks the first measure and discards a draft of the
    // second one, which is neither locked nor what the caller asked for.
    await expect(
      transitions.discardMeasureRevision({
        measureId: first.measureId,
        revisionId: second.revisionId,
      })
    ).rejects.toThrow(/autre mesure/i);

    const untouched = await db.measureRevision.findUniqueOrThrow({
      where: { id: second.revisionId },
    });
    expect(untouched.discardedAt).toBeNull();
  });

  it("never leaves latestRevisionId on a discarded draft", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();

    await transitions.discardMeasureRevision({ measureId, revisionId });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    // The measure has no published revision here, so the pointer falls back to null
    // rather than to a draft the audit would flag as abandoned-but-designated.
    expect(measure.latestRevisionId).toBeNull();
  });

  it("removes the index document when the last draft of a never-published measure goes", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();

    await transitions.discardMeasureRevision({ measureId, revisionId });

    const document = await db.searchDocument.findUnique({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // Nothing is left to represent: no published revision, no active draft. Leaving an
    // ADMIN_ONLY document behind would make the moderation search offer a measure whose
    // text no longer exists anywhere, and the audit would report it as stale forever.
    expect(document).toBeNull();
  });
});
