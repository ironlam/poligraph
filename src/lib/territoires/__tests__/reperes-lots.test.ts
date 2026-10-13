import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    repereImport: { findUnique: h.findUnique, updateMany: h.updateMany },
    territoireRepere: { count: h.count },
    auditLog: { create: h.auditCreate },
    $queryRaw: h.queryRaw,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});

import { transitionLot } from "@/lib/territoires/reperes-lots";

const META = { ip: "127.0.0.1", userAgent: "test" };
const act = (action: string, extra: Record<string, unknown> = {}) =>
  ({ action, reviewedBy: null, reason: null, ...extra }) as Parameters<typeof transitionLot>[1];

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({ status: "IN_REVIEW", rowCount: 10 });
  h.count.mockResolvedValue(10);
  h.queryRaw.mockResolvedValue([{ n: 0 }]);
  h.updateMany.mockResolvedValue({ count: 1 });
  h.auditCreate.mockResolvedValue({});
});

describe("publication d'un lot", () => {
  it("publie un lot cohérent, nomme le relecteur et trace l'audit", async () => {
    const r = await transitionLot("lot1", act("PUBLISH", { reviewedBy: "Lamine" }), META);
    expect(r).toEqual({ ok: true, id: "lot1", status: "PUBLISHED" });
    const data = h.updateMany.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ status: "PUBLISHED", reviewedBy: "Lamine" });
    expect(data.reviewedAt).toBeInstanceOf(Date);
    expect(h.auditCreate.mock.calls[0]?.[0].data).toMatchObject({
      action: "PUBLISH",
      entityType: "RepereImport",
      entityId: "lot1",
    });
  });

  it("exige le nom du relecteur pour publier", async () => {
    const r = await transitionLot("lot1", act("PUBLISH"), META);
    expect(r).toMatchObject({ ok: false, httpStatus: 400 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un lot dont le nombre de lignes ne correspond pas", async () => {
    h.count.mockResolvedValueOnce(9);
    const r = await transitionLot("lot1", act("PUBLISH", { reviewedBy: "L" }), META);
    expect(r).toMatchObject({ ok: false, httpStatus: 409 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un lot dont un état contredit la valeur", async () => {
    h.queryRaw.mockResolvedValueOnce([{ n: 3 }]);
    const r = await transitionLot("lot1", act("PUBLISH", { reviewedBy: "L" }), META);
    expect(r).toMatchObject({ ok: false, httpStatus: 409 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("ne publie pas un brouillon sans passage par la revue", async () => {
    h.findUnique.mockResolvedValueOnce({ status: "DRAFT", rowCount: 10 });
    const r = await transitionLot("lot1", act("PUBLISH", { reviewedBy: "L" }), META);
    expect(r).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it("dépublie vers le brouillon avec un motif, sans effacer les lignes", async () => {
    expect(await transitionLot("lot1", act("UNPUBLISH"), META)).toMatchObject({
      ok: false,
      httpStatus: 400,
    });
    h.findUnique.mockResolvedValueOnce({ status: "PUBLISHED", rowCount: 10 });
    const r = await transitionLot("lot1", act("UNPUBLISH", { reason: "erreur" }), META);
    expect(r).toEqual({ ok: true, id: "lot1", status: "DRAFT" });
  });

  it("répond 404 pour un lot inconnu et 409 si l'état a changé entre-temps", async () => {
    h.findUnique.mockResolvedValueOnce(null);
    expect(await transitionLot("x", act("SUBMIT"), META)).toMatchObject({ httpStatus: 404 });
    h.findUnique.mockResolvedValueOnce({ status: "DRAFT", rowCount: 10 });
    h.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await transitionLot("lot1", act("SUBMIT"), META)).toMatchObject({ httpStatus: 409 });
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("ne revalide aucun cache : les pages suivent leur profil de 24 h", () => {
    const code = readFileSync(join(process.cwd(), "src/lib/territoires/reperes-lots.ts"), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code).not.toMatch(
      /revalidateTag|revalidateTags|updateTag|revalidatePath|requestProfileRefresh/
    );
  });
});
