import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let lot: typeof import("../publication-lot");

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

describeIfDisposableDb("lots de publication", () => {
  const ids: string[] = [];
  const lotIds: string[] = [];
  let seq = 0;

  async function person(status: "DRAFT" | "PUBLISHED" = "DRAFT") {
    const n = ++seq;
    const p = await db.politician.create({
      data: {
        slug: `test-pub-lot-${n}`,
        firstName: "Test",
        lastName: `Lot${n}`,
        fullName: `Test Lot${n}`,
        publicationStatus: status,
      },
    });
    ids.push(p.id);
    return p.id;
  }

  /** Simule un lot appliqué : instantané DRAFT, puis statut PUBLISHED et ligne APPLIED. */
  async function appliedLot(personIds: string[]) {
    const lotId = `test-lot-${Date.now()}-${++seq}`;
    lotIds.push(lotId);
    await lot.snapshotStatuses(db, personIds, lotId);
    await db.politician.updateMany({
      where: { id: { in: personIds } },
      data: { publicationStatus: "PUBLISHED" },
    });
    await lot.recordApplied(
      db,
      lotId,
      personIds.map((id) => ({ id, publicationStatus: "PUBLISHED" as const }))
    );
    return lotId;
  }

  const state = (id: string) =>
    db.politician.findUniqueOrThrow({
      where: { id },
      select: { publicationStatus: true, statusOverride: true },
    });

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    lot = await import("../publication-lot");
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { entityType: "Politician", entityId: { in: ids } } });
    await db.politician.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("restaure une fiche inchangée et pose statusOverride", async () => {
    const a = await person();
    const lotId = await appliedLot([a]);

    const res = await lot.rollbackLot(db, lotId);

    expect(res).toEqual({ restored: [a], skipped: [] });
    expect(await state(a)).toEqual({ publicationStatus: "DRAFT", statusOverride: true });
    expect(await db.auditLog.count({ where: { action: lot.LOT_ROLLBACK, entityId: a } })).toBe(1);
  });

  it("laisse intacte une fiche passée sous statusOverride après le lot", async () => {
    const a = await person();
    const lotId = await appliedLot([a]);
    await db.politician.update({ where: { id: a }, data: { statusOverride: true } });

    const res = await lot.rollbackLot(db, lotId);

    expect(res.restored).toEqual([]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ id: a });
    expect(await state(a)).toEqual({ publicationStatus: "PUBLISHED", statusOverride: true });
  });

  it("laisse intacte une fiche dont le statut a changé à la main depuis", async () => {
    const a = await person();
    const b = await person();
    const lotId = await appliedLot([a, b]);
    await db.politician.update({ where: { id: a }, data: { publicationStatus: "ARCHIVED" } });

    const res = await lot.rollbackLot(db, lotId);

    expect(res.restored).toEqual([b]);
    expect(res.skipped.map((s) => s.id)).toEqual([a]);
    expect(await state(a)).toEqual({ publicationStatus: "ARCHIVED", statusOverride: false });
    expect(await state(b)).toEqual({ publicationStatus: "DRAFT", statusOverride: true });
  });

  it("ignore une fiche que le lot n'a pas modifiée", async () => {
    const a = await person("PUBLISHED");
    const b = await person();
    const lotId = `test-lot-${Date.now()}-${++seq}`;
    await lot.snapshotStatuses(db, [a, b], lotId);
    await db.politician.update({ where: { id: b }, data: { publicationStatus: "PUBLISHED" } });
    await lot.recordApplied(db, lotId, [{ id: b, publicationStatus: "PUBLISHED" }]);

    const res = await lot.rollbackLot(db, lotId);

    expect(res.restored).toEqual([b]);
    expect(res.skipped.map((s) => s.id)).toEqual([a]);
    expect(await state(a)).toEqual({ publicationStatus: "PUBLISHED", statusOverride: false });
  });

  it("refuse de réutiliser un identifiant de lot", async () => {
    const a = await person();
    const lotId = `test-lot-${Date.now()}-${++seq}`;
    await lot.snapshotStatuses(db, [a], lotId);
    await expect(lot.snapshotStatuses(db, [a], lotId)).rejects.toThrow(/déjà un instantané/);
  });

  it("signale un lot interrompu (instantané sans APPLIED) sans rien restaurer", async () => {
    const a = await person();
    const b = await person();
    const lotId = `test-lot-${Date.now()}-${++seq}`;
    await lot.snapshotStatuses(db, [a, b], lotId);
    await db.politician.update({ where: { id: a }, data: { publicationStatus: "PUBLISHED" } });

    const res = await lot.rollbackLot(db, lotId);

    expect(res.restored).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(res.incomplete?.snapshotted).toBe(2);
    expect(res.incomplete?.message).toMatch(/aucune ligne APPLIED/);
    const byId = Object.fromEntries(res.incomplete!.politicians.map((p) => [p.id, p]));
    expect(byId[a]).toMatchObject({ before: "DRAFT", current: "PUBLISHED" });
    expect(byId[b]).toMatchObject({ before: "DRAFT", current: "DRAFT" });
    expect(await state(a)).toEqual({ publicationStatus: "PUBLISHED", statusOverride: false });
    expect(await db.auditLog.count({ where: { action: lot.LOT_ROLLBACK, entityId: a } })).toBe(0);
  });
});
