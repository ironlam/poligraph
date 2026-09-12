import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred: these modules import @/lib/db as a value.
let db: typeof import("@/lib/db").db;
let applyCandidacyChunk: typeof import("../candidatures").applyCandidacyChunk;

/**
 * The update/insert pair of one chunk. The batch changed the granularity of a failure, so the
 * failing path is the one worth proving: the inserts of an aborted chunk must not land.
 */
describeIfDisposableDb("application d'un chunk de candidatures", () => {
  let electionId: string;
  let existingId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ applyCandidacyChunk } = await import("../candidatures"));

    const election = await db.election.create({
      data: {
        slug: "municipales-chunk-test",
        type: "MUNICIPALES",
        scope: "MUNICIPAL",
        title: "Test chunk",
      },
    });
    electionId = election.id;
  });

  beforeEach(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    const existing = await db.candidacy.create({
      data: { electionId, candidateName: "Existant", partyLabel: "ANCIEN" },
    });
    existingId = existing.id;
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.election.delete({ where: { id: electionId } });
    await db.$disconnect();
  });

  function update(id: string, patch: Record<string, unknown> = {}) {
    return {
      id,
      politicianId: null,
      partyId: null,
      partyLabel: "NOUVEAU",
      listName: null,
      listPosition: null,
      constituencyName: null,
      candidateId: null,
      communeId: null,
      ...patch,
    };
  }

  it("écrit les mises à jour puis les créations", async () => {
    const applied = await applyCandidacyChunk(
      [update(existingId)],
      [{ electionId, candidateName: "Nouveau" }]
    );

    expect(applied).toEqual({ updated: 1, created: 1, missing: 0, failure: null });
    expect(await db.candidacy.count({ where: { electionId } })).toBe(2);
  });

  it("ne signale aucune candidature manquante sur un doublon légitime", async () => {
    // The regression this guards: the batch deduplicates, so two entries for one id affect one row.
    // Comparing that 1 to the two entries received used to report a missing candidacy and turn the
    // whole sync into success: false.
    const applied = await applyCandidacyChunk(
      [
        update(existingId, { partyLabel: "PREMIER" }),
        update(existingId, { partyLabel: "DERNIER" }),
      ],
      []
    );

    expect(applied.updated).toBe(1);
    expect(applied.missing).toBe(0);

    const after = await db.candidacy.findUniqueOrThrow({ where: { id: existingId } });
    expect(after.partyLabel).toBe("DERNIER");
  });

  it("signale un identifiant réellement absent", async () => {
    const applied = await applyCandidacyChunk([update(existingId), update("inexistant")], []);

    expect(applied.updated).toBe(1);
    expect(applied.missing).toBe(1);
  });

  it("n'écrit aucune création quand la mise à jour échoue", async () => {
    // A politicianId that points nowhere violates the foreign key, so the UPDATE fails. The inserts
    // come after it and must not land.
    const applied = await applyCandidacyChunk(
      [update(existingId, { politicianId: "politicien-inexistant" })],
      [{ electionId, candidateName: "Ne doit pas exister" }]
    );

    expect(applied.failure).toContain("mise à jour");
    expect(applied.updated).toBe(0);
    expect(applied.created).toBe(0);

    expect(
      await db.candidacy.count({ where: { electionId, candidateName: "Ne doit pas exister" } })
    ).toBe(0);
    const untouched = await db.candidacy.findUniqueOrThrow({ where: { id: existingId } });
    expect(untouched.partyLabel).toBe("ANCIEN");
  });

  it("comptabilise les mises à jour même si la création échoue ensuite", async () => {
    // The two halves are separate statements with no transaction around them, so an update that
    // succeeded is committed. Losing its count would under-report candidaciesUpdated on a run that
    // really did write rows.
    const applied = await applyCandidacyChunk(
      [update(existingId, { partyLabel: "BIEN ÉCRIT" })],
      [{ electionId: "election-inexistante", candidateName: "Création impossible" }]
    );

    expect(applied.updated).toBe(1);
    expect(applied.created).toBe(0);
    expect(applied.failure).toContain("création");

    const written = await db.candidacy.findUniqueOrThrow({ where: { id: existingId } });
    expect(written.partyLabel).toBe("BIEN ÉCRIT");
  });
});
