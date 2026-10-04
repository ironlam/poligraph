import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, executeRaw, build } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  build: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: (fn: (tx: { $queryRaw: typeof queryRaw }) => unknown) =>
      fn({ $queryRaw: queryRaw }),
  },
}));
vi.mock("../build", () => ({ buildPoliticianProfileDocument: build }));

import { refreshPoliticianProfile } from "../refresh";
import { hashSerializedDocument, serializeProfileDocument } from "../document";
import { PENDING_INVALIDATION_HASH } from "../store";
import type { Prisma } from "@/generated/prisma";
import type { PoliticianProfileDocument } from "../document";

const doc = {
  identity: { id: "pol-1", slug: "slug-courant" },
  dossier: {},
  voteStats: null,
  mandateType: null,
} as unknown as PoliticianProfileDocument;
const hash = hashSerializedDocument(serializeProfileDocument(doc));
/** The database clock, as readDatabaseNow returns it: the first query of every refresh. */
const DB_NOW = new Date("2026-10-04T08:00:00.123Z");

/** The locked read of the previous hash, then the upsert (one row when written). */
function stored(prevHash: string | null, written: boolean) {
  queryRaw
    .mockResolvedValueOnce(prevHash === null ? [] : [{ contentHash: prevHash }])
    .mockResolvedValueOnce(written ? [{ "?column?": 1 }] : []);
}

describe("refreshPoliticianProfile", () => {
  const revalidate = vi.fn();

  beforeEach(() => {
    queryRaw.mockReset();
    executeRaw.mockReset();
    build.mockReset();
    revalidate.mockReset();
    queryRaw.mockResolvedValueOnce([{ now: DB_NOW }]);
    build.mockResolvedValue(doc);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("invalide la fiche du slug courant quand le contenu change", async () => {
    stored("ancienne", true);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome).toMatchObject({ politicianId: "pol-1", status: "updated", reason: "test" });
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledWith("politician:slug-courant");
  });

  it("n'invalide pas à la première écriture : aucune page n'a encore servi ce document", async () => {
    stored(null, true);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("unchanged");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("n'invalide pas quand le contenu est inchangé", async () => {
    stored(hash, true);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("unchanged");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("n'invalide pas quand l'écriture est rejetée comme plus ancienne", async () => {
    stored("plus-récente", false);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("skipped-stale");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("n'écrit ni n'invalide une fiche non publique sans document stocké", async () => {
    build.mockResolvedValue(null);
    queryRaw.mockResolvedValueOnce([]);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome).toMatchObject({ status: "not-public", removed: false });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("laisse en place, sans l'invalider, le document d'une fiche non publique avec keepNonPublic", async () => {
    build.mockResolvedValue(null);
    queryRaw.mockResolvedValueOnce([{ slug: "slug-stocké" }]);
    executeRaw.mockResolvedValueOnce(1);
    const outcome = await refreshPoliticianProfile("pol-1", "test", {
      revalidate,
      keepNonPublic: true,
    });
    expect(outcome).toMatchObject({ status: "not-public", removed: false });
    // Only the clock read: neither the stored slug nor a delete.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("date le calcul à l'horloge de la base, pas à celle du serveur", async () => {
    stored("ancienne", true);
    await refreshPoliticianProfile("pol-1", "test", { revalidate });
    const clockSql = queryRaw.mock.calls[0]![0] as Prisma.Sql;
    expect(clockSql.sql).toMatch(/clock_timestamp\(\)/);
    const upsert = queryRaw.mock.calls[2]![0] as Prisma.Sql;
    expect(upsert.sql).toMatch(/INSERT INTO "PoliticianProfileSnapshot"/);
    expect(upsert.values).toContainEqual(DB_NOW);
  });

  it("invalide le slug stocké puis supprime le document d'une fiche devenue non publique", async () => {
    build.mockResolvedValue(null);
    queryRaw.mockResolvedValueOnce([{ slug: "slug-stocké" }]);
    executeRaw.mockResolvedValueOnce(1);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome).toMatchObject({ status: "not-public", removed: true });
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("politician:slug-stocké");
    const del = executeRaw.mock.calls[0]![0] as Prisma.Sql;
    expect(del.sql).toMatch(/DELETE FROM "PoliticianProfileSnapshot"/);
    expect(revalidate.mock.invocationCallOrder[0]).toBeLessThan(
      executeRaw.mock.invocationCallOrder[0]!
    );
    const line = vi.mocked(console.info).mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({ status: "not-public", removed: true });
  });

  it("garde le document d'une fiche non publique quand son invalidation échoue", async () => {
    build.mockResolvedValue(null);
    queryRaw.mockResolvedValueOnce([{ slug: "slug-stocké" }]);
    revalidate.mockRejectedValue(new Error("revalidate indisponible"));
    await expect(refreshPoliticianProfile("pol-1", "test", { revalidate })).rejects.toThrow(
      "revalidate indisponible"
    );
    expect(executeRaw).not.toHaveBeenCalled();
    const line = vi.mocked(console.info).mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({ status: "not-public", revalidateFailed: true });
  });

  it("journalise une ligne JSON par recalcul", async () => {
    stored(hash, true);
    await refreshPoliticianProfile("pol-1", "test", { revalidate });
    const line = vi.mocked(console.info).mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({
      event: "[profile-snapshot] refresh",
      politicianId: "pol-1",
      status: "unchanged",
      reason: "test",
    });
  });

  it("journalise l'échec d'invalidation avant de le propager", async () => {
    stored("ancienne", true);
    revalidate.mockRejectedValue(new Error("revalidate indisponible"));
    await expect(refreshPoliticianProfile("pol-1", "test", { revalidate })).rejects.toThrow(
      "revalidate indisponible"
    );
    const line = vi.mocked(console.info).mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({
      event: "[profile-snapshot] refresh",
      politicianId: "pol-1",
      status: "updated",
      revalidateFailed: true,
    });
  });

  it("remplace l'empreinte par la sentinelle quand l'invalidation échoue, puis relance l'erreur", async () => {
    stored("ancienne", true);
    executeRaw.mockResolvedValue(1);
    revalidate.mockRejectedValue(new Error("revalidate indisponible"));
    await expect(refreshPoliticianProfile("pol-1", "test", { revalidate })).rejects.toThrow(
      "revalidate indisponible"
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const sql = executeRaw.mock.calls[0]![0] as Prisma.Sql;
    expect(sql.sql).toMatch(/UPDATE "PoliticianProfileSnapshot"/);
    expect(sql.sql).toMatch(/"builtAt" = /);
    expect(sql.values[0]).toBe(PENDING_INVALIDATION_HASH);
    expect(sql.values[1]).toBe("pol-1");
    // The row is matched on this build's start: the same instant written by the upsert.
    const upsert = queryRaw.mock.calls[2]![0] as Prisma.Sql;
    expect(sql.values[2]).toEqual(DB_NOW);
    expect(upsert.values).toContainEqual(sql.values[2]);
  });

  it("relance l'erreur d'invalidation d'origine même si la sentinelle ne s'écrit pas", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stored("ancienne", true);
    executeRaw.mockRejectedValue(new Error("base indisponible"));
    revalidate.mockRejectedValue(new Error("revalidate indisponible"));
    await expect(refreshPoliticianProfile("pol-1", "test", { revalidate })).rejects.toThrow(
      "revalidate indisponible"
    );
    expect(JSON.parse(String(errorSpy.mock.calls.at(-1)?.[0]))).toMatchObject({
      event: "[profile-snapshot] pending-invalidation mark failed",
      politicianId: "pol-1",
      message: "base indisponible",
    });
    errorSpy.mockRestore();
  });

  it("invalide à la nouvelle tentative quand l'empreinte stockée est la sentinelle", async () => {
    stored(PENDING_INVALIDATION_HASH, true);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("updated");
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("politician:slug-courant");
  });
});
