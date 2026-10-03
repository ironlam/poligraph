import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, build } = vi.hoisted(() => ({ queryRaw: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: queryRaw,
    $transaction: (fn: (tx: { $queryRaw: typeof queryRaw }) => unknown) =>
      fn({ $queryRaw: queryRaw }),
  },
}));
vi.mock("../build", () => ({ buildPoliticianProfileDocument: build }));

import { refreshPoliticianProfile } from "../refresh";
import { hashSerializedDocument, serializeProfileDocument } from "../document";
import type { PoliticianProfileDocument } from "../document";

const doc = {
  identity: { id: "pol-1", slug: "slug-courant" },
  dossier: {},
  voteStats: null,
  mandateType: null,
} as unknown as PoliticianProfileDocument;
const hash = hashSerializedDocument(serializeProfileDocument(doc));

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
    build.mockReset();
    revalidate.mockReset();
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

  it("n'écrit ni n'invalide une fiche non publique", async () => {
    build.mockResolvedValue(null);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("not-public");
    expect(queryRaw).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
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
});
