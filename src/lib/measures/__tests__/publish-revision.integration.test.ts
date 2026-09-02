import { afterAll, beforeAll, expect, expectTypeOf, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type { publishMeasureRevision as PublishFn } from "../transitions";
import { draftInput, seedMeasureWithDraft, withIndexingRejected } from "./helpers";

// Deferred: `../transitions` imports `@/lib/db` as a value, which throws at module load
// without DATABASE_URL. The type-only import above is erased, so it costs nothing.
let db: typeof import("@/lib/db").db;
let draftMeasureRevision: typeof import("../transitions").draftMeasureRevision;
let publishMeasureRevision: typeof import("../transitions").publishMeasureRevision;
let reviewMeasureRevision: typeof import("../transitions").reviewMeasureRevision;

// A type-level assertion, and the invariant is about the SHAPE OF THE PARAMETER: the
// moment publish accepts a review timestamp, it declares the review instead of verifying
// it, and the "a published revision has been reviewed" guarantee becomes circular.
//
// Deliberately NOT an assertion on the function body. A first version of this plan checked
// that the string "reviewedAt" is absent from publishMeasureRevision.toString(), which is
// guaranteed red: the function MUST read revision.reviewedAt to verify the review. The
// constraint is on what the caller can pass, not on what the body does.
//
// Erased at runtime: it is `npx tsc --noEmit` that fails on a violation.
// `expectedUpdatedAt` was added in lot 2 for optimistic concurrency. `publishedBy` carries
// the authenticated actor to the audit log. Neither declares a review: the transition still
// reads reviewedAt from the stored revision. The exact shape is kept rather than loosened,
// so that any future field has to be added here deliberately.
it("keeps the publication input free of any review field", () => {
  expectTypeOf<Parameters<typeof PublishFn>[0]>().toEqualTypeOf<{
    measureId: string;
    revisionId: string;
    publishedBy?: string;
    expectedUpdatedAt?: Date;
    batchKind?: "FIRST_PUBLICATION" | "CONTEXT_CORRECTION";
  }>();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeIfDisposableDb("publishMeasureRevision concurrency", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ publishMeasureRevision, reviewMeasureRevision } = await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("leaves exactly one current revision when two publications race", async () => {
    // The plan proposed a timing test instead: hold the row with FOR UPDATE, start a
    // publication, sleep, assert it has not settled. That test stays GREEN with the lock
    // removed, so it proves nothing about the lock. The reason is that
    // publishMeasureRevision ends with an UPDATE on the very row the outer transaction
    // holds, so the call is blocked by the WRITE whether or not it locked first.
    //
    // What FOR UPDATE actually protects is the read-then-decide sequence. Without it, two
    // concurrent publications both read "no published revision", and the second one writes
    // a decision taken on a stale read. The observable violation is not a delay, it is two
    // published revisions of which neither is superseded.
    const { measureId, revisionId: first } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId: first, reviewedBy: "relecteur" });

    // A second reviewed revision, built directly: draftMeasureRevision would discard the
    // first one, and this test needs two publishable revisions at the same time. Building
    // the violation by hand is the plan's own rule for invariants no public sequence can
    // reach.
    const second = await db.measureRevision.create({
      data: {
        measureId,
        text: "Version concurrente.",
        validFrom: new Date("2027-03-01T00:00:00Z"),
        extractionMethod: "MANUAL",
        reviewedAt: new Date(),
        reviewedBy: "relecteur",
        sources: {
          create: [
            {
              sourceKind: "ARTICLE_PRESSE",
              tier: "SECONDARY",
              url: "https://example.org/concurrent",
              publishedAt: new Date("2027-03-01T00:00:00Z"),
            },
          ],
        },
      },
    });

    // Exactly two concurrent transactions, which is exactly the pool limit (max: 2). A
    // third would deadlock on connection acquisition rather than on the row.
    const results = await Promise.allSettled([
      publishMeasureRevision({ measureId, revisionId: first }),
      publishMeasureRevision({ measureId, revisionId: second.id }),
    ]);

    // Both are allowed to succeed: serialised by the lock, the second simply supersedes
    // the first. What must never happen is two current revisions.
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);

    const current = await db.measureRevision.findMany({
      where: { measureId, publishedAt: { not: null }, supersededAt: null },
      select: { id: true },
    });
    expect(current).toHaveLength(1);

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(current[0]?.id).toBe(measure.publishedRevisionId);
  });

  it("blocks while another transaction holds the measure row", async () => {
    // Kept as a weaker, separate claim, and worded for what it actually shows: the call
    // does not sail past a row another transaction holds. It does NOT distinguish the lock
    // from the final UPDATE, which is why the race test above exists.
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" });

    let settled = false;
    let attempt: Promise<void> | undefined;

    // The pool is max: 2 per process. This holds one connection and waits for a second,
    // which is exactly the limit, so it must never open a third transaction.
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Measure" WHERE id = ${measureId} FOR UPDATE`;

      attempt = publishMeasureRevision({ measureId, revisionId }).then(() => {
        settled = true;
      });

      await sleep(400);

      expect(settled).toBe(false);
    });

    await attempt;
    expect(settled).toBe(true);

    const published = await db.measureRevision.findMany({
      where: { measureId, publishedAt: { not: null }, supersededAt: null },
    });
    expect(published).toHaveLength(1);
  });
});

describeIfDisposableDb("publishMeasureRevision guards", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ draftMeasureRevision, publishMeasureRevision, reviewMeasureRevision } =
      await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses an unreviewed revision", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();

    await expect(publishMeasureRevision({ measureId, revisionId })).rejects.toThrow(/non relue/i);

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(measure.publishedRevisionId).toBeNull();
  });

  it("moves publicationStatus to PUBLISHED itself", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" });

    await publishMeasureRevision({ measureId, revisionId });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    // The first version's tests set this field by hand, which hid the fact that no code
    // path ever moved it: every measure would have stayed invisible forever.
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.publishedRevisionId).toBe(revisionId);
  });

  it("audits an authenticated editorial publication", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" });

    await publishMeasureRevision({ measureId, revisionId, publishedBy: "admin" });

    await expect(
      db.auditLog.findFirstOrThrow({
        where: {
          action: "PUBLISH_MEASURE_REVISION",
          entityType: "MeasureRevision",
          entityId: revisionId,
        },
      })
    ).resolves.toMatchObject({ userId: "admin", changes: { measureId } });
  });

  it("supersedes the previous published revision and leaves exactly one current", async () => {
    const { measureId, revisionId: first } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId: first, reviewedBy: "relecteur" });
    await publishMeasureRevision({ measureId, revisionId: first });

    const { revisionId: second } = await draftMeasureRevision(
      draftInput(measureId, "Nouvelle version.")
    );
    await reviewMeasureRevision({ measureId, revisionId: second, reviewedBy: "relecteur" });
    await publishMeasureRevision({ measureId, revisionId: second });

    const current = await db.measureRevision.findMany({
      where: { measureId, publishedAt: { not: null }, supersededAt: null },
      select: { id: true },
    });
    const superseded = await db.measureRevision.findUniqueOrThrow({ where: { id: first } });

    // The invariant is "at most one PUBLISHED non-superseded revision", not "at most one
    // non-superseded revision": a pending draft also has supersededAt null and that is the
    // normal state. Conflating the two is what made the first version's test vacuous.
    expect(current.map((r) => r.id)).toEqual([second]);
    expect(superseded.supersededAt).not.toBeNull();
    expect(superseded.publishedAt).not.toBeNull();
  });

  it("indexes the published text in the same transaction", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" });
    await publishMeasureRevision({ measureId, revisionId });

    const doc = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });
    // The vector is Unsupported("tsvector"), so Prisma cannot read it: a raw read is the
    // only way to prove the second statement of the upsert ran. The plan asserted on a
    // searchText column, which the lot 1B review removed.
    const rows = await db.$queryRaw<{ lexemes: string | null }[]>`
      SELECT "searchVector"::text AS lexemes
      FROM "SearchDocument"
      WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${measureId}
    `;

    expect(doc.visibility).toBe("PUBLIC");
    expect(doc.sourceRevisionId).toBe(revisionId);
    expect(rows[0]?.lexemes).not.toBeNull();
    expect(rows[0]?.lexemes).toContain("loyers");
  });

  it("does not move latestRevisionId backwards when a draft is in flight", async () => {
    const { measureId, revisionId: first } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId: first, reviewedBy: "relecteur" });
    await publishMeasureRevision({ measureId, revisionId: first });

    const { revisionId: draft } = await draftMeasureRevision(
      draftInput(measureId, "Correction en cours.")
    );

    // Republishing the current revision while a correction is being written. Moving
    // latestRevisionId back to `first` would orphan the draft.
    await publishMeasureRevision({ measureId, revisionId: first });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publishedRevisionId).toBe(first);
    expect(measure.latestRevisionId).toBe(draft);

    const orphans = await db.measureRevision.findMany({
      where: { measureId, publishedAt: null, discardedAt: null, id: { not: draft } },
    });
    expect(orphans).toHaveLength(0);
  });

  it("rolls back the whole publication when indexing fails", async () => {
    const { measureId, revisionId } = await seedMeasureWithDraft();
    await reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur" });

    await withIndexingRejected(async () => {
      await expect(publishMeasureRevision({ measureId, revisionId })).rejects.toThrow();
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    const revision = await db.measureRevision.findUniqueOrThrow({ where: { id: revisionId } });

    // Three writes precede the indexing: publishedAt on the revision, the pointer, and
    // publicationStatus. A partial rollback here would put the measure online while the
    // index still describes a draft, which is the exact state the same-transaction rule
    // exists to make impossible.
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(measure.publishedRevisionId).toBeNull();
    expect(revision.publishedAt).toBeNull();
  });

  it("leaves the index untouched when a guard refuses the publication", async () => {
    const { measureId } = await seedMeasureWithDraft();
    const { revisionId: unreviewed } = await draftMeasureRevision(
      draftInput(measureId, "Brouillon non relu.")
    );

    await expect(publishMeasureRevision({ measureId, revisionId: unreviewed })).rejects.toThrow();

    const doc = await db.searchDocument.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // What this proves: a guard that refuses wrote nothing. The document is still the
    // ADMIN_ONLY one that createMeasure and draftMeasureRevision produced, and it is NOT
    // PUBLIC. What it does NOT prove is transactional atomicity: the review guard throws
    // BEFORE any write, so an ablation moving the upsert out of the transaction would stay
    // green here. The rollback is covered by the lot 1B test on the primitive and by
    // createMeasure's own atomicity test.
    expect(doc.visibility).toBe("ADMIN_ONLY");
    expect(doc.sourceRevisionId).toBe(unreviewed);
  });
});
