import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedCandidacy, seedElection, seedParty, seedPolitician } from "./helpers";

// Deferred: `../program-editions` imports `@/lib/db` as a value, which throws at module
// load without DATABASE_URL, so a static import fails the file instead of skipping.
let db: typeof import("@/lib/db").db;
let createProgramEdition: typeof import("../program-editions").createProgramEdition;

describeIfDisposableDb("createProgramEdition", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ createProgramEdition } = await import("../program-editions"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  function base(electionId: string) {
    return {
      electionId,
      label: "Programme 2027, édition de janvier",
      version: 1,
      publishedAt: new Date("2027-01-15T00:00:00Z"),
      documentUrl: "https://example.org/programme.pdf",
    };
  }

  it("refuses an edition with no owner", async () => {
    const electionId = await seedElection();

    // Exactly one owner, not at least one: an edition owned by nobody cannot be
    // attributed and cannot be displayed.
    await expect(
      createProgramEdition({
        ...base(electionId),
        ownerType: "PARTY",
        partyId: null,
        candidacyId: null,
      })
    ).rejects.toThrow(/propriétaire/i);
  });

  it("refuses an edition with two owners", async () => {
    const electionId = await seedElection();
    const partyId = await seedParty();
    const politicianId = await seedPolitician();
    const candidacyId = await seedCandidacy(politicianId, electionId);

    // Left open by an earlier revision of the spec, which made "whose programme is this"
    // unanswerable.
    await expect(
      createProgramEdition({ ...base(electionId), ownerType: "PARTY", partyId, candidacyId })
    ).rejects.toThrow(/propriétaire/i);
  });

  it("refuses an ownerType that disagrees with the field that is set", async () => {
    const electionId = await seedElection();
    const politicianId = await seedPolitician();
    const candidacyId = await seedCandidacy(politicianId, electionId);

    // ownerType is what says which field to read: if it lies, every consumer reads the
    // wrong one and gets null.
    await expect(
      createProgramEdition({ ...base(electionId), ownerType: "PARTY", partyId: null, candidacyId })
    ).rejects.toThrow(/propriétaire/i);
  });

  it("creates an edition with exactly one owner", async () => {
    const electionId = await seedElection();
    const partyId = await seedParty();

    const { programEditionId } = await createProgramEdition({
      ...base(electionId),
      ownerType: "PARTY",
      partyId,
      candidacyId: null,
    });

    const edition = await db.programEdition.findUniqueOrThrow({ where: { id: programEditionId } });
    expect(edition.partyId).toBe(partyId);
    expect(edition.candidacyId).toBeNull();
    // Creation never publishes, same rule as measures: an edition becomes visible through
    // a deliberate act, not as a side effect of being recorded.
    expect(edition.publicationStatus).toBe("DRAFT");
  });
});
