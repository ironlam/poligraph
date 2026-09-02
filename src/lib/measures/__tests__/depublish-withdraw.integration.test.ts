import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { publishSeededMeasure, withIndexingRejected } from "./helpers";

// Deferred: `../transitions` imports `@/lib/db` as a value, which throws at module load
// without DATABASE_URL, so a static import fails the file instead of skipping the block.
let db: typeof import("@/lib/db").db;
let depublishMeasure: typeof import("../transitions").depublishMeasure;
let withdrawMeasure: typeof import("../transitions").withdrawMeasure;

describeIfDisposableDb("depublishMeasure", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ depublishMeasure } = await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("hides the document without deleting it", async () => {
    const { measureId } = await publishSeededMeasure();

    await depublishMeasure({ measureId, reason: "Erreur factuelle signalée." });

    const doc = await db.searchDocument.findUnique({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });
    // The vector is Unsupported("tsvector") so Prisma cannot read it. The plan asserted on
    // a searchText column, which the lot 1B review removed.
    const rows = await db.$queryRaw<{ lexemes: string | null }[]>`
      SELECT "searchVector"::text AS lexemes
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${measureId}
    `;

    // Deleting the row would force a full reindex to bring the measure back, and the
    // indexed text is not reproducible from the index itself.
    expect(doc).not.toBeNull();
    expect(doc?.visibility).toBe("ADMIN_ONLY");
    expect(rows[0]?.lexemes).not.toBeNull();
  });

  it("leaves a trace of why", async () => {
    const { measureId } = await publishSeededMeasure();

    await depublishMeasure({
      measureId,
      reason: "Erreur factuelle signalée.",
      depublishedBy: "admin",
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    // Without these two fields, a depublished measure is indistinguishable from one that
    // was never published, and nobody can tell why it left the site.
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(measure.depublishedAt).not.toBeNull();
    expect(measure.depublicationReason).toContain("Erreur factuelle");
    // The revision is untouched: depublication is our act, not a change to what the
    // candidate said.
    const revision = await db.measureRevision.findUniqueOrThrow({
      where: { id: measure.publishedRevisionId! },
    });
    expect(revision.supersededAt).toBeNull();
    await expect(
      db.auditLog.findFirst({
        where: {
          action: "DEPUBLISH_MEASURE",
          entityType: "Measure",
          entityId: measureId,
          userId: "admin",
        },
      })
    ).resolves.not.toBeNull();
  });

  it("rolls back the depublication when indexing fails", async () => {
    // Seeded BEFORE arming the guard: publishSeededMeasure indexes twice on its way, so it
    // would fail under the constraint itself.
    const { measureId, revisionId } = await publishSeededMeasure();

    await withIndexingRejected(async () => {
      await expect(
        depublishMeasure({ measureId, reason: "Motif qui ne doit pas survivre." })
      ).rejects.toThrow();
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    const doc = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // A partial rollback would be the worst of both: the measure marked depublished while
    // the index still serves it as PUBLIC.
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.depublishedAt).toBeNull();
    expect(measure.depublicationReason).toBeNull();
    expect(doc.visibility).toBe("PUBLIC");
    expect(doc.sourceRevisionId).toBe(revisionId);
  });

  it("refuses a depublication with no stated reason", async () => {
    const { measureId } = await publishSeededMeasure();

    await expect(depublishMeasure({ measureId, reason: "  " })).rejects.toThrow(/motif/i);
  });
});

describeIfDisposableDb("withdrawMeasure", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ withdrawMeasure } = await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses a withdrawal without both a source url and a source label", async () => {
    const { measureId } = await publishSeededMeasure();
    const withdrawnAt = new Date("2027-03-01T00:00:00Z");

    await expect(
      withdrawMeasure({
        measureId,
        withdrawnAt,
        sourceUrl: "https://example.org/retrait",
        sourceLabel: "",
      })
    ).rejects.toThrow(/source/i);
    await expect(
      withdrawMeasure({ measureId, withdrawnAt, sourceUrl: "", sourceLabel: "Le Monde" })
    ).rejects.toThrow(/source/i);

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    // The three fields are written together or not at all: a withdrawnAt with no source is
    // an unsourced claim that a candidate dropped a proposal.
    expect(measure.withdrawnAt).toBeNull();
    expect(measure.withdrawnSourceUrl).toBeNull();
    expect(measure.withdrawnSourceLabel).toBeNull();
  });

  it("keeps a withdrawn measure published but closes its search document", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();

    await withdrawMeasure({
      measureId,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Le Monde, 1er mars 2027",
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    const doc = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // A withdrawn measure does not disappear. Erasing a proposal a candidate publicly
    // carried and then dropped would delete information that matters.
    expect(measure.withdrawnAt).not.toBeNull();
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.publishedRevisionId).toBe(revisionId);
    expect(doc.visibility).toBe("ADMIN_ONLY");
  });
});
