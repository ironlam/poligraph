import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { publishSeededMeasure } from "./helpers";

let db: typeof import("@/lib/db").db;
let transitions: typeof import("../transitions");
let errors: typeof import("../errors");
let getPublicMeasure: typeof import("@/lib/data/measures").getPublicMeasure;

/**
 * Optimistic concurrency on publication.
 *
 * The lock in publishMeasureRevision() serialises two concurrent publications, it does not stop
 * the second from overwriting the first: that is last-writer-wins, and the reviewer who loses
 * never learns it. The case that matters is not two publications racing, it is a publication
 * racing a DEPUBLICATION, because depublishing is our answer to legally or factually dangerous
 * content.
 *
 * Checking the state before calling the transition would not do: that is a read-then-decide
 * outside the lock, which is the race lot 1 documented. The comparison has to be inside the
 * transaction.
 */
describeIfDisposableDb("publishMeasureRevision : concurrence optimiste", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    transitions = await import("../transitions");
    errors = await import("../errors");
    ({ getPublicMeasure } = await import("@/lib/data/measures"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuse de republier ce qu'un autre relecteur vient de dépublier", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();

    // What reviewer B's page showed: the measure, published.
    const seenByB = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { updatedAt: true },
    });

    // Reviewer A takes it down for a legal reason.
    await transitions.depublishMeasure({
      measureId,
      reason: "Mise en cause nominative, retrait demandé par le conseil",
    });

    // Reviewer B clicks publish, from the page rendered before A acted.
    await expect(
      transitions.publishMeasureRevision({
        measureId,
        revisionId,
        expectedUpdatedAt: seenByB.updatedAt,
      })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    // The depublication holds. This is the assertion that matters: without it the test would
    // pass on any thrown error while the content went back online.
    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(measure.depublishedAt).not.toBeNull();
    expect(measure.depublicationReason).toBe(
      "Mise en cause nominative, retrait demandé par le conseil"
    );
    expect(await getPublicMeasure(measureId)).toBeNull();
  });

  it("refuse une seconde soumission de la même publication", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    const published = await db.measureRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { publishedAt: true },
    });
    const stale = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { updatedAt: true },
    });

    // A correction goes through, so the measure moves on.
    const { revisionId: correctionId } = await transitions.draftMeasureRevision({
      measureId,
      revision: {
        text: "Encadrer les loyers, périmètre étendu aux communes littorales.",
        precision: null,
        validFrom: new Date("2027-02-01T00:00:00Z"),
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: "ARTICLE_PRESSE",
          tier: "SECONDARY",
          url: "https://example.org/correction",
          page: null,
          publishedAt: new Date("2027-02-01T00:00:00Z"),
        },
      ],
    });
    await transitions.reviewMeasureRevision({
      measureId,
      revisionId: correctionId,
      reviewedBy: "relecteur",
    });

    await expect(
      transitions.publishMeasureRevision({
        measureId,
        revisionId,
        expectedUpdatedAt: stale.updatedAt,
      })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    // publishedAt is the date the public reads, so rewriting it is a factual change and not a
    // harmless retry.
    const after = await db.measureRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { publishedAt: true },
    });
    expect(after.publishedAt).toEqual(published.publishedAt);
  });

  it("publie quand la version attendue correspond", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await transitions.depublishMeasure({ measureId, reason: "Vérification d'une source" });

    // Read AFTER the depublication: this is what a freshly rendered page would carry.
    const fresh = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { updatedAt: true },
    });

    await transitions.publishMeasureRevision({
      measureId,
      revisionId,
      expectedUpdatedAt: fresh.updatedAt,
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.depublishedAt).toBeNull();
    expect(await getPublicMeasure(measureId)).not.toBeNull();
  });

  it("laisse passer un appel sans version attendue, pour les scripts et la migration", async () => {
    // The parameter is optional on purpose: the 2C migration and the seed scripts have no page
    // to have rendered, so demanding a version from them would be a check with nothing to check.
    const { measureId, revisionId } = await publishSeededMeasure();
    await transitions.depublishMeasure({ measureId, reason: "Vérification d'une source" });

    await transitions.publishMeasureRevision({ measureId, revisionId });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("PUBLISHED");
  });
});
