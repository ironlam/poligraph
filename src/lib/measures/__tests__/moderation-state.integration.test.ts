import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import {
  deriveModerationState,
  MODERATION_MEASURE_SELECT,
  toModerationMeasureRow,
} from "../moderation-state";
import { publishSeededMeasure, seedMeasureWithDraft } from "./helpers";

// `../moderation-state` is imported statically on purpose: it only imports types, so it
// loads without DATABASE_URL. The two modules below reach the Prisma client as a value.
let db: typeof import("@/lib/db").db;
let getPublicMeasure: typeof import("@/lib/data/measures").getPublicMeasure;

/**
 * The invariant this file exists for: the moderation queue must say exactly what the public
 * read decides, not what `publicationStatus` suggests.
 *
 * It is checked by CROSSING the two functions on the same row, never by re-reading the
 * derivation. A test that only asserted `publiclyVisible === false` would stay green if the
 * derivation and the public filter drifted apart in the same direction.
 */
async function crossCheck(measureId: string): Promise<{ derived: boolean; publicRead: boolean }> {
  const row = await db.measure.findUniqueOrThrow({
    where: { id: measureId },
    select: MODERATION_MEASURE_SELECT,
  });
  return {
    derived: deriveModerationState(toModerationMeasureRow(row)).publiclyVisible,
    publicRead: (await getPublicMeasure(measureId)) !== null,
  };
}

describeIfDisposableDb("publiclyVisible face à la lecture publique réelle", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getPublicMeasure } = await import("@/lib/data/measures"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("agrees on a correctly published measure", async () => {
    const { measureId } = await publishSeededMeasure();

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(true);
  });

  it("agrees on a measure that only has a draft", async () => {
    const { measureId } = await seedMeasureWithDraft();

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(false);
  });

  // The case the ablation targets. Removing `sourceCount > 0` from the derivation makes the
  // queue announce this measure as publicly visible while getPublicMeasure() returns null.
  it("agrees when the published revision lost its last source", async () => {
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureSource.deleteMany({ where: { measureRevisionId: revisionId } });

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(false);
  });

  it("agrees on a depublished measure", async () => {
    const { measureId } = await publishSeededMeasure();
    const { depublishMeasure } = await import("../transitions");
    await depublishMeasure({ measureId, reason: "Formulation contestée par le candidat" });

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(false);
  });

  it.each([
    ["unreviewed", { reviewedAt: null, reviewedBy: null }],
    ["never published", { publishedAt: null }],
    ["superseded", { supersededAt: new Date("2027-03-01T00:00:00Z") }],
    ["discarded", { discardedAt: new Date("2027-03-01T00:00:00Z") }],
  ])("agrees when the pointed revision is %s", async (_label, data) => {
    // Written directly to the database: the transitions refuse to produce these states, and
    // they are exactly what a past import or a manual correction leaves behind.
    const { measureId, revisionId } = await publishSeededMeasure();
    await db.measureRevision.update({ where: { id: revisionId }, data });

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(false);
  });

  it("agrees on a status the measure transitions never write", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measure.update({ where: { id: measureId }, data: { publicationStatus: "EXCLUDED" } });

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(false);
  });

  it("agrees that a withdrawn measure stays publicly visible", async () => {
    // A withdrawal does not hide the measure, it is displayed on it. The detail read returns
    // the row and the derivation must not pretend otherwise.
    const { measureId } = await publishSeededMeasure();
    const { withdrawMeasure } = await import("../transitions");
    await withdrawMeasure({
      measureId,
      withdrawnAt: new Date("2027-03-01T00:00:00Z"),
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Le Monde, 1er mars 2027",
    });

    const { derived, publicRead } = await crossCheck(measureId);

    expect(derived).toBe(publicRead);
    expect(derived).toBe(true);
  });

  it("agrees that an incomplete withdrawal does not hide the measure either", async () => {
    const { measureId } = await publishSeededMeasure();
    await db.measure.update({
      where: { id: measureId },
      data: { withdrawnAt: new Date("2027-03-01T00:00:00Z") },
    });

    const row = await db.measure.findUniqueOrThrow({
      where: { id: measureId },
      select: MODERATION_MEASURE_SELECT,
    });
    const state = deriveModerationState(toModerationMeasureRow(row));

    expect(state.publiclyVisible).toBe((await getPublicMeasure(measureId)) !== null);
    expect(state.publiclyVisible).toBe(true);
    expect(state.anomalies.map((a) => a.code)).toContain("withdrawn_without_source");
  });
});
