import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  communeCount: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    territoireEvenement: { findFirst: h.findFirst, updateMany: h.updateMany },
    commune: { count: h.communeCount },
    auditLog: { create: h.auditCreate },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});

import { traiterRapportCrc } from "../rapports-crc-validation";

const META = { ip: "127.0.0.1", userAgent: "test" };
const brouillon = (over = {}) => ({
  status: "DRAFT",
  territoryType: "COM",
  territoryCode: "54370",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.findFirst.mockResolvedValue(brouillon());
  h.updateMany.mockResolvedValue({ count: 1 });
  h.communeCount.mockResolvedValue(1);
  h.auditCreate.mockResolvedValue({});
});

describe("traiterRapportCrc", () => {
  it("publie un brouillon rattaché, nomme le relecteur et trace l'audit", async () => {
    const r = await traiterRapportCrc("e1", { action: "PUBLIER", reviewedBy: "Lamine" }, META);
    expect(r).toEqual({ ok: true, id: "e1" });
    expect(h.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "e1", status: "DRAFT", territoryCode: "54370" },
      data: { status: "PUBLISHED" },
    });
    expect(h.auditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "PUBLIER",
      entityType: "TerritoireEvenement",
      entityId: "e1",
      changes: { to: "PUBLISHED", reviewedBy: "Lamine", territoryCode: "54370" },
    });
  });

  it("refuse de publier sans territoire", async () => {
    h.findFirst.mockResolvedValue(brouillon({ territoryCode: null }));
    const r = await traiterRapportCrc("e1", { action: "PUBLIER", reviewedBy: "Lamine" }, META);
    expect(r).toMatchObject({ ok: false, httpStatus: 409 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("corrige le territoire et garde l'ancien dans l'audit", async () => {
    const r = await traiterRapportCrc(
      "e1",
      { action: "RATTACHER", territoryType: "DEP", territoryCode: "55" },
      META
    );
    expect(r.ok).toBe(true);
    expect(h.updateMany.mock.calls[0]?.[0].data).toEqual({
      territoryType: "DEP",
      territoryCode: "55",
    });
    expect(h.auditCreate.mock.calls[0]?.[0].data.changes).toEqual({
      from: { territoryType: "COM", territoryCode: "54370" },
      to: { territoryType: "DEP", territoryCode: "55" },
    });
  });

  it.each([
    ["une commune absente", "COM", "99999"],
    ["un département inconnu", "DEP", "96"],
    ["une région inconnue", "REG", "99"],
  ])("refuse %s", async (_cas, territoryType, territoryCode) => {
    h.communeCount.mockResolvedValue(0);
    const r = await traiterRapportCrc(
      "e1",
      { action: "RATTACHER", territoryType, territoryCode } as never,
      META
    );
    expect(r).toMatchObject({ ok: false, httpStatus: 400 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("rejette avec un motif", async () => {
    await traiterRapportCrc("e1", { action: "REJETER", reason: "Rapport sur un syndicat" }, META);
    expect(h.updateMany.mock.calls[0]?.[0].data).toEqual({ status: "REJECTED" });
    expect(h.auditCreate.mock.calls[0]?.[0].data.changes).toMatchObject({
      reason: "Rapport sur un syndicat",
    });
  });

  it("ne touche ni à une notice publiée, ni à un autre type, ni à un changement concurrent", async () => {
    h.findFirst.mockResolvedValueOnce(brouillon({ status: "PUBLISHED" }));
    expect(await traiterRapportCrc("e1", { action: "REJETER", reason: "x" }, META)).toMatchObject({
      httpStatus: 409,
    });
    h.findFirst.mockResolvedValueOnce(null);
    expect(await traiterRapportCrc("e1", { action: "REJETER", reason: "x" }, META)).toMatchObject({
      httpStatus: 404,
    });
    expect(h.findFirst.mock.calls[1]?.[0].where).toEqual({ id: "e1", type: "RAPPORT_CRC" });
    h.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await traiterRapportCrc("e1", { action: "REJETER", reason: "x" }, META)).toMatchObject({
      httpStatus: 409,
    });
    expect(h.auditCreate).not.toHaveBeenCalled();
  });
});
