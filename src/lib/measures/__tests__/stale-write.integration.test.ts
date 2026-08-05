import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { draftInput, publishSeededMeasure, seedMeasureWithDraft } from "./helpers";

let db: typeof import("@/lib/db").db;
let transitions: typeof import("../transitions");
let errors: typeof import("../errors");
let getPublicMeasure: typeof import("@/lib/data/measures").getPublicMeasure;

/**
 * Optimistic concurrency: refusing a write built on a state the reviewer no longer sees.
 *
 * The lock serialises concurrent calls, it does not stop the second from overwriting the first:
 * that is last-writer-wins, and the reviewer who loses never learns it. Checking before calling
 * the transition would not do either, since that is a read-then-decide outside the lock, which is
 * the race lot 1 documented. The comparison has to be inside the transaction.
 *
 * **What `Measure.updatedAt` covers, exactly.** It moves when a transition writes the Measure ROW:
 * publication, depublication, withdrawal, drafting, discarding. It is therefore NOT a version of
 * the whole editorial dossier: reviewing a revision, adding a qualification or recording a
 * similarity assessment write a revision or a child table and leave it untouched. Those are
 * protected differently, by their own preconditions.
 */
describeIfDisposableDb("écritures fondées sur un état périmé", () => {
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

  /** What a rendered page carries. */
  async function versionOf(measureId: string): Promise<Date> {
    const measure = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: { updatedAt: true },
    });
    return measure.updatedAt;
  }

  /** Another reviewer pushes a correction all the way through. */
  async function publishCorrection(measureId: string, text: string): Promise<string> {
    const { revisionId } = await transitions.draftMeasureRevision(draftInput(measureId, text));
    await transitions.reviewMeasureRevision({ measureId, revisionId, reviewedBy: "relecteur B" });
    await transitions.publishMeasureRevision({ measureId, revisionId });
    return revisionId;
  }

  it("refuse de republier ce qu'un autre relecteur vient de dépublier", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    const seenByB = await versionOf(measureId);

    // Reviewer A takes it down for a legal reason.
    await transitions.depublishMeasure({
      measureId,
      reason: "Mise en cause nominative, retrait demandé par le conseil",
    });

    // Reviewer B clicks publish, from the page rendered before A acted.
    await expect(
      transitions.publishMeasureRevision({ measureId, revisionId, expectedUpdatedAt: seenByB })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    // The depublication holds. This is the assertion that matters: without it the test would pass
    // on any thrown error while the content went back online.
    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(measure.depublishedAt).not.toBeNull();
    expect(await getPublicMeasure(measureId)).toBeNull();
  });

  it("refuse une seconde soumission de la même publication", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    const published = await db.measureRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { publishedAt: true },
    });
    const stale = await versionOf(measureId);

    await publishCorrection(measureId, "Encadrer les loyers, périmètre étendu.");

    await expect(
      transitions.publishMeasureRevision({ measureId, revisionId, expectedUpdatedAt: stale })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    // publishedAt is the date the public reads, so rewriting it is a factual change and not a
    // harmless retry.
    const after = await db.measureRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { publishedAt: true },
    });
    expect(after.publishedAt).toEqual(published.publishedAt);
  });

  it("refuse un brouillon fondé sur une page périmée, qui abandonnerait le brouillon récent", async () => {
    // The case that makes drafting as dangerous as publishing: draftMeasureRevision() ACTIVELY
    // discards the previous active draft. From a stale page, it would throw away a colleague's
    // work in progress without anyone seeing it.
    const { measureId } = await seedMeasureWithDraft();
    const seenByB = await versionOf(measureId);

    const { revisionId: draftFromA } = await transitions.draftMeasureRevision(
      draftInput(measureId, "Encadrer les loyers, version de A.")
    );

    await expect(
      transitions.draftMeasureRevision({
        ...draftInput(measureId, "Encadrer les loyers, version de B."),
        expectedUpdatedAt: seenByB,
      })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    const draft = await db.measureRevision.findUniqueOrThrow({ where: { id: draftFromA } });
    expect(measure.latestRevisionId).toBe(draftFromA);
    expect(draft.discardedAt).toBeNull();
  });

  it("refuse une dépublication fondée sur un état antérieur à une correction publiée", async () => {
    const { measureId } = await publishSeededMeasure();
    const seenByB = await versionOf(measureId);

    const correctionId = await publishCorrection(measureId, "Formulation corrigée par A.");

    await expect(
      transitions.depublishMeasure({
        measureId,
        reason: "Motif fondé sur l'ancienne formulation",
        expectedUpdatedAt: seenByB,
      })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.publishedRevisionId).toBe(correctionId);
    expect(measure.depublishedAt).toBeNull();
    expect(await getPublicMeasure(measureId)).not.toBeNull();
  });

  it("refuse un retrait fondé sur un état que le relecteur n'a pas vu", async () => {
    // A withdrawal is the candidate's act, recorded by us. Recording it against a state nobody
    // looked at attaches a political fact to the wrong formulation.
    const { measureId } = await publishSeededMeasure();
    const seenByB = await versionOf(measureId);

    await publishCorrection(measureId, "Formulation corrigée par A.");

    await expect(
      transitions.withdrawMeasure({
        measureId,
        withdrawnAt: new Date("2027-03-01T00:00:00Z"),
        sourceUrl: "https://example.org/retrait",
        sourceLabel: "Conférence de presse",
        expectedUpdatedAt: seenByB,
      })
    ).rejects.toBeInstanceOf(errors.MeasureConcurrencyError);

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.withdrawnAt).toBeNull();
    expect(measure.withdrawnSourceUrl).toBeNull();
    expect(measure.withdrawnSourceLabel).toBeNull();
  });

  it("publie quand la version attendue correspond", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await transitions.depublishMeasure({ measureId, reason: "Vérification d'une source" });

    // Read AFTER the depublication: this is what a freshly rendered page would carry.
    const fresh = await versionOf(measureId);

    await transitions.publishMeasureRevision({ measureId, revisionId, expectedUpdatedAt: fresh });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.depublishedAt).toBeNull();
    expect(await getPublicMeasure(measureId)).not.toBeNull();
  });

  it("laisse passer les appels sans version attendue, pour les scripts et la migration", async () => {
    // The parameter is optional on purpose: the 2C migration and the seed scripts have no page to
    // have rendered, so demanding a version from them would be a check with nothing to check.
    const { measureId, revisionId } = await publishSeededMeasure();
    await transitions.depublishMeasure({ measureId, reason: "Vérification d'une source" });
    await transitions.publishMeasureRevision({ measureId, revisionId });
    await transitions.withdrawMeasure({
      measureId,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Conférence de presse",
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    expect(measure.publicationStatus).toBe("PUBLISHED");
    expect(measure.withdrawnAt).not.toBeNull();
  });
});
