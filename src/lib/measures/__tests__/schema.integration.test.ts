import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedCandidacy, seedElection, seedParty, seedPolitician } from "./helpers";

// Deferred import: `@/lib/db` throws at module load when DATABASE_URL is unset,
// and describe.skip skips a block without undoing an import.
let db: typeof import("@/lib/db").db;

describeIfDisposableDb("ProgramEdition uniqueness", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("rejects a second PARTY edition with the same version", async () => {
    const electionId = await seedElection();
    const partyId = await seedParty();
    const edition = {
      electionId,
      ownerType: "PARTY" as const,
      partyId,
      candidacyId: null,
      label: "Programme 2027, édition de janvier",
      version: 1,
      publishedAt: new Date("2027-01-15T00:00:00Z"),
      documentUrl: "https://example.org/programme.pdf",
      publicationStatus: "DRAFT" as const,
    };

    await db.programEdition.create({ data: edition });

    // A single @@unique([ownerType, partyId, candidacyId, electionId, version]) would
    // let this through: both rows have candidacyId NULL, and PostgreSQL treats NULLs
    // in a unique index as distinct. Two separate constraints are the only fix.
    await expect(db.programEdition.create({ data: edition })).rejects.toThrow();
  });

  it("allows a PARTY and a CANDIDACY edition to share election and version", async () => {
    const electionId = await seedElection();
    const partyId = await seedParty();
    const politicianId = await seedPolitician();
    const candidacyId = await seedCandidacy(politicianId, electionId);
    const common = {
      electionId,
      label: "Programme 2027",
      version: 1,
      publishedAt: new Date("2027-01-15T00:00:00Z"),
      documentUrl: "https://example.org/programme.pdf",
      publicationStatus: "DRAFT" as const,
    };

    await db.programEdition.create({
      data: { ...common, ownerType: "PARTY", partyId, candidacyId: null },
    });

    // The two constraints must not bleed into each other: a party programme and a
    // candidate programme for the same election are two different documents.
    await expect(
      db.programEdition.create({
        data: { ...common, ownerType: "CANDIDACY", partyId: null, candidacyId },
      })
    ).resolves.toBeTruthy();
  });
});
