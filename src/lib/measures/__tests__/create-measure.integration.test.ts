import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedCandidacy, seedElection, seedParty, seedPolitician } from "./helpers";

// Two deferred imports, and neither is optional. `@/lib/db` throws at module load when
// DATABASE_URL is unset, and `../transitions` imports it as a VALUE, so a top-level
// import of either fails the whole FILE instead of skipping the block: the run then
// reports "1 file failed, 0 tests failed", which is not a test failure at all.
// describeIfDisposableDb skips a block, it cannot undo an import.
let db: typeof import("@/lib/db").db;
let createMeasure: typeof import("../transitions").createMeasure;

function baseInput(politicianId: string, electionId: string) {
  return {
    politicianId,
    electionId,
    candidacyId: null,
    programEditionId: null,
    attribution: "PERSONAL" as const,
    theme: "LOGEMENT_URBANISME" as const,
    precedingMeasureId: null,
    revision: {
      text: "Encadrer les loyers dans les zones tendues.",
      precision: "OBJECTIF_SANS_CHIFFRE" as const,
      validFrom: new Date("2027-01-15T00:00:00Z"),
      extractionMethod: "MANUAL" as const,
      extractionConfidence: null,
      extractorVersion: null,
    },
    sources: [
      {
        sourceKind: "DISCOURS_CAMPAGNE" as const,
        tier: "PRIMARY" as const,
        url: "https://example.org/meeting",
        page: null,
        publishedAt: new Date("2027-01-15T00:00:00Z"),
      },
    ],
  };
}

describeIfDisposableDb("createMeasure", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ createMeasure } = await import("../transitions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses a candidacy that belongs to another politician", async () => {
    const owner = await seedPolitician();
    const other = await seedPolitician();
    const electionId = await seedElection();
    const foreignCandidacy = await seedCandidacy(other, electionId);

    // Without this check, a measure page would attribute a proposal to a candidacy
    // that is not the politician's, and nothing in the schema forbids it: both foreign
    // keys are valid on their own.
    await expect(
      createMeasure({ ...baseInput(owner, electionId), candidacyId: foreignCandidacy })
    ).rejects.toThrow(/candidature/i);

    expect(await db.measure.count({ where: { politicianId: owner } })).toBe(0);
  });

  it("refuses a program edition attached to another election", async () => {
    const politicianId = await seedPolitician();
    const electionId = await seedElection();
    const otherElectionId = await seedElection();
    const partyId = await seedParty();
    const edition = await db.programEdition.create({
      data: {
        electionId: otherElectionId,
        ownerType: "PARTY",
        partyId,
        label: "Programme d'une autre élection",
        version: 1,
        publishedAt: new Date("2027-01-01T00:00:00Z"),
        documentUrl: "https://example.org/autre.pdf",
      },
    });

    await expect(
      createMeasure({ ...baseInput(politicianId, electionId), programEditionId: edition.id })
    ).rejects.toThrow(/élection/i);
  });

  it("creates a draft measure that points at its first revision and publishes nothing", async () => {
    const politicianId = await seedPolitician();
    const electionId = await seedElection();
    const candidacyId = await seedCandidacy(politicianId, electionId);

    const { measureId, revisionId } = await createMeasure({
      ...baseInput(politicianId, electionId),
      candidacyId,
    });

    const measure = await db.measure.findUniqueOrThrow({ where: { id: measureId } });
    const revision = await db.measureRevision.findUniqueOrThrow({
      where: { id: revisionId },
      include: { sources: true },
    });

    expect(measure.latestRevisionId).toBe(revisionId);
    // Creation must never publish: a fresh measure is invisible until a human reviews
    // and publishes it, and the revision 1 tests set publicationStatus by hand, which
    // hid the fact that no code path ever moved it.
    expect(measure.publishedRevisionId).toBeNull();
    expect(measure.publicationStatus).toBe("DRAFT");
    expect(revision.reviewedAt).toBeNull();
    expect(revision.publishedAt).toBeNull();
    expect(revision.sources).toHaveLength(1);
    expect(revision.sources[0]?.sourceKind).toBe("DISCOURS_CAMPAGNE");
  });

  it("indexes the fresh measure as ADMIN_ONLY, in the same transaction", async () => {
    const politicianId = await seedPolitician();
    const electionId = await seedElection();

    const { measureId, revisionId } = await createMeasure(baseInput(politicianId, electionId));

    const document = await db.searchDocument.findUnique({
      where: { entityType_entityId: { entityType: "MEASURE", entityId: measureId } },
    });

    // Spec 7.2 requires the row to exist from creation, in ADMIN_ONLY: a measure with no
    // document is invisible to the moderation search from the moment it exists. Asserted
    // here and not left to the publication task, otherwise the syncSearchDocument call
    // added by createMeasure would be exercised by nothing.
    expect(document).not.toBeNull();
    expect(document?.visibility).toBe("ADMIN_ONLY");
    expect(document?.sourceRevisionId).toBe(revisionId);
    expect(document?.body).toContain("loyers");
  });

  it("refuses a revision without any source", async () => {
    const politicianId = await seedPolitician();
    const electionId = await seedElection();

    // A measure with no source cannot ever be published (audit rule of spec 12.1), so
    // creating one is creating something that is structurally unpublishable.
    await expect(
      createMeasure({ ...baseInput(politicianId, electionId), sources: [] })
    ).rejects.toThrow(/source/i);
  });
});
