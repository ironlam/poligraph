import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { buildCandidacyUpdateBatch, type CandidacyUpdateRow } from "../candidacy-update-batch";

// Deferred: this module imports @/lib/db as a value.
let db: typeof import("@/lib/db").db;

function row(id: string, patch: Partial<CandidacyUpdateRow> = {}): CandidacyUpdateRow {
  return {
    id,
    politicianId: null,
    partyId: null,
    partyLabel: null,
    listName: null,
    listPosition: null,
    constituencyName: null,
    candidateId: null,
    communeId: null,
    ...patch,
  };
}

async function flush(rows: CandidacyUpdateRow[]): Promise<number> {
  const batch = buildCandidacyUpdateBatch(rows, new Date());
  return batch === null ? 0 : db.$executeRaw(batch.sql);
}

/**
 * The properties the sequential loop had, which raw SQL does not get for free: a written
 * `updatedAt`, nulls that stay null, an integer column that accepts an all-null batch, a
 * deterministic winner on duplicates, and a defined answer when the target no longer exists.
 */
describeIfDisposableDb("mise à jour par lot des candidatures", () => {
  let electionId: string;
  let firstId: string;
  let secondId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));

    const election = await db.election.create({
      data: {
        slug: "municipales-batch-test",
        type: "MUNICIPALES",
        scope: "MUNICIPAL",
        title: "Test lot",
      },
    });
    electionId = election.id;
  });

  beforeEach(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    const first = await db.candidacy.create({
      data: { electionId, candidateName: "Premier", partyLabel: "ANCIEN", listPosition: 7 },
    });
    const second = await db.candidacy.create({
      data: { electionId, candidateName: "Second", partyLabel: "ANCIEN" },
    });
    firstId = first.id;
    secondId = second.id;
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.election.delete({ where: { id: electionId } });
    await db.$disconnect();
  });

  it("écrit les valeurs et compte les lignes", async () => {
    const count = await flush([
      row(firstId, { partyLabel: "NOUVEAU", listName: "Liste A", listPosition: 2 }),
      row(secondId, { partyLabel: "AUTRE" }),
    ]);

    expect(count).toBe(2);

    const after = await db.candidacy.findUniqueOrThrow({ where: { id: firstId } });
    expect(after.partyLabel).toBe("NOUVEAU");
    expect(after.listName).toBe("Liste A");
    expect(after.listPosition).toBe(2);
  });

  it("fait strictement avancer updatedAt", async () => {
    // Forced back in SQL, not through Prisma: `@updatedAt` is filled client side, so a freshly
    // created row already carries "now" and a `>=` assertion would pass even if the batch never
    // touched the column. Starting from a known old value is what makes the check mean something.
    const stale = new Date("2020-01-01T00:00:00.000Z");
    await db.$executeRaw(
      Prisma.sql`UPDATE "Candidacy" SET "updatedAt" = ${stale} WHERE id = ${firstId}`
    );

    await flush([row(firstId, { partyLabel: "NOUVEAU" })]);

    const after = await db.candidacy.findUniqueOrThrow({ where: { id: firstId } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("remet à null une colonne dont la valeur devient nulle", async () => {
    await flush([row(firstId, { partyLabel: null, listPosition: null })]);

    const after = await db.candidacy.findUniqueOrThrow({ where: { id: firstId } });
    expect(after.partyLabel).toBeNull();
    expect(after.listPosition).toBeNull();
  });

  it("accepte un lot dont la colonne entière est entièrement nulle", async () => {
    // Without the SET-side cast, PostgreSQL infers `text` for an all-null VALUES column and the
    // assignment to the integer column fails.
    await expect(
      flush([row(firstId, { listPosition: null }), row(secondId, { listPosition: null })])
    ).resolves.toBe(2);
  });

  it("applique la dernière ligne quand un identifiant est répété", async () => {
    await flush([
      row(secondId, { partyLabel: "PREMIER PASSAGE" }),
      row(secondId, { partyLabel: "DERNIER PASSAGE" }),
    ]);

    const after = await db.candidacy.findUniqueOrThrow({ where: { id: secondId } });
    expect(after.partyLabel).toBe("DERNIER PASSAGE");
  });

  it("donne le même résultat que la boucle séquentielle sur les mêmes entrées", async () => {
    // The reference the batch replaces, run on a second pair of rows, then compared column by
    // column. This is the equivalence claim itself, not a proxy for it.
    const a = await db.candidacy.create({
      data: { electionId, candidateName: "Ref A", partyLabel: "ANCIEN" },
    });
    const b = await db.candidacy.create({
      data: { electionId, candidateName: "Ref B", partyLabel: "ANCIEN" },
    });

    const inputs = [
      row(a.id, { partyLabel: "X", listName: "LX", listPosition: 1 }),
      row(b.id, { partyLabel: "Y" }),
      row(a.id, { partyLabel: "Z", listName: "LZ", listPosition: 3 }),
    ];

    // Sequential reference, exactly what candidatures.ts used to do.
    for (const input of inputs) {
      const { id, ...data } = input;
      await db.candidacy.update({ where: { id }, data });
    }
    const sequentialA = await db.candidacy.findUniqueOrThrow({ where: { id: a.id } });
    const sequentialB = await db.candidacy.findUniqueOrThrow({ where: { id: b.id } });

    // Reset, then apply the same inputs as one batch.
    await db.candidacy.update({
      where: { id: a.id },
      data: { partyLabel: "ANCIEN", listName: null, listPosition: null },
    });
    await db.candidacy.update({ where: { id: b.id }, data: { partyLabel: "ANCIEN" } });
    await flush(inputs);

    const batchedA = await db.candidacy.findUniqueOrThrow({ where: { id: a.id } });
    const batchedB = await db.candidacy.findUniqueOrThrow({ where: { id: b.id } });

    for (const key of [
      "partyLabel",
      "listName",
      "listPosition",
      "politicianId",
      "candidateId",
      "communeId",
      "constituencyName",
    ] as const) {
      expect(batchedA[key]).toEqual(sequentialA[key]);
      expect(batchedB[key]).toEqual(sequentialB[key]);
    }
  });

  it("ignore un identifiant absent et le signale par le compte", async () => {
    // Documented divergence: db.candidacy.update() raised P2025 on a missing row, the batch
    // silently updates nothing. The caller compares the count to the batch size, see task 4.
    const count = await flush([
      row(firstId, { partyLabel: "OK" }),
      row("inexistant", { partyLabel: "PERDU" }),
    ]);

    expect(count).toBe(1);
  });

  it("ne fait rien et rend zéro sur un lot vide", async () => {
    await expect(flush([])).resolves.toBe(0);
  });

  it("tient le budget de 500 ms sur un lot de 500 lignes", async () => {
    const created = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        db.candidacy.create({ data: { electionId, candidateName: `Charge ${i}` } })
      )
    );
    const rows = created.map((c, i) => row(c.id, { partyLabel: `P${i}`, listPosition: i }));
    const batch = buildCandidacyUpdateBatch(rows, new Date())!;

    // EXPLAIN ANALYZE on an UPDATE performs the write. That is why this only ever runs against the
    // disposable container, and why the budget is checked on Execution Time rather than on a
    // wall-clock timer, which would also count the round trip and let a one-second batch pass.
    const plan = await db.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${batch.sql}`
    );
    const rootPlan = (plan[0]!["QUERY PLAN"] as Array<{ "Execution Time": number }>)[0]!;
    const executionMs = rootPlan["Execution Time"];

    // Local container, no network: this bounds the statement's cost, it does not predict the
    // duration of a national re-import. Report it as a local figure.
    console.log(`[batch] 500 lignes : ${executionMs} ms d'Execution Time (conteneur local)`);
    expect(executionMs).toBeLessThan(500);
  });
});
