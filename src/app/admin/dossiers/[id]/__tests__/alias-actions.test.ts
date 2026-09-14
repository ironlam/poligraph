import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ isAuthenticated: mocks.auth }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "test", "x-forwarded-for": "127.0.0.1" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateEntity: mocks.invalidate }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
import {
  createDossierAlias,
  deleteDossierAlias,
  publishDossierAlias,
  updateDossierAliasSources,
} from "../alias-actions";

const sources = [
  { url: "https://www.senat.fr/exemple", label: "Sénat" },
  { url: "https://www.assemblee-nationale.fr/exemple", label: "Assemblée nationale" },
];
const input = { dossierId: "dossier", label: "Loi exemple", kind: "COMMON", sources };
const alias = {
  ...input,
  id: "alias",
  normalizedLabel: "exemple",
  status: "DRAFT",
  isPreferred: false,
  verifiedAt: null,
  verifiedBy: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(true);
  mocks.create.mockResolvedValue(alias);
  mocks.findUnique.mockResolvedValue(alias);
  mocks.findMany.mockResolvedValue([]);
  mocks.update.mockResolvedValue(alias);
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      legislativeDossierAlias: {
        create: mocks.create,
        findUnique: mocks.findUnique,
        findMany: mocks.findMany,
        update: mocks.update,
        delete: mocks.delete,
      },
      auditLog: { create: mocks.audit },
    })
  );
});

describe("mutations des noms d’usage", () => {
  it("authentifie chaque action avant tout accès DB", async () => {
    mocks.auth.mockResolvedValue(false);
    for (const call of [
      () => createDossierAlias(input),
      () => deleteDossierAlias("alias"),
      () => publishDossierAlias("alias", false),
      () => updateDossierAliasSources("alias", sources),
    ]) {
      await expect(call()).rejects.toThrow("Non autorisé");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("crée les références et l’audit dans la même transaction", async () => {
    expect(await createDossierAlias(input)).toEqual({ ok: true });
    expect(mocks.create).toHaveBeenCalledWith({ data: { ...input, normalizedLabel: "exemple" } });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        ipAddress: "127.0.0.1",
        userAgent: "test",
        changes: { after: expect.objectContaining({ sources }) },
      }),
    });
  });
  it("distingue un doublon d’un échec de journalisation", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    expect(await createDossierAlias(input)).toMatchObject({
      ok: false,
      message: expect.stringContaining("Aucune modification"),
    });
    expect(mocks.invalidate).not.toHaveBeenCalled();
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7" })
    );
    expect(await createDossierAlias(input)).toMatchObject({
      ok: false,
      message: expect.stringContaining("existe déjà"),
    });
  });
  it("conserve la provenance complète dans l’audit de suppression", async () => {
    expect(await deleteDossierAlias("alias")).toEqual({ ok: true });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        changes: {
          before: expect.objectContaining({ label: input.label, sources, dossierId: "dossier" }),
        },
      }),
    });
  });
  it("ne valide pas la suppression si l’audit échoue", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(deleteDossierAlias("alias")).rejects.toThrow("audit unavailable");
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("remet en brouillon après changement des références", async () => {
    expect(await updateDossierAliasSources("alias", sources)).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "alias" },
      data: { sources, status: "DRAFT", isPreferred: false, verifiedAt: null, verifiedBy: null },
    });
  });
  it("refuse les sources invalides et un booléen forgé", async () => {
    expect(
      await updateDossierAliasSources("alias", [{ url: "javascript:alert(1)", label: "Piège" }])
    ).toMatchObject({ ok: false });
    expect(await publishDossierAlias("alias", "true" as unknown as boolean)).toMatchObject({
      ok: false,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
