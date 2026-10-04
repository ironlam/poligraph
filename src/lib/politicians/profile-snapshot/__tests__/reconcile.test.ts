import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { politician: { findMany: vi.fn() } } }));

import { runReconcileBatch } from "../reconcile";
import type { RefreshOutcome } from "../refresh";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(3, "0")}`);

function listFrom(all: string[]) {
  return vi.fn(async (cursor: string | null, take: number) =>
    all.filter((id) => (cursor ? id > cursor : true)).slice(0, take)
  );
}

function outcome(id: string, status: RefreshOutcome["status"], removed = false): RefreshOutcome {
  return { politicianId: id, status, durationMs: 1, reason: "test", removed };
}

describe("runReconcileBatch", () => {
  it("s'arrête au budget de temps et rend le curseur", async () => {
    let clock = 0;
    const refresh = vi.fn(async (id: string) => {
      clock += 100;
      return outcome(id, "unchanged");
    });
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 250, invalidationsLeft: 10 },
      { listIds: listFrom(ids(10)), refresh, now: () => clock }
    );
    expect(r.processed).toBe(3);
    expect(r.cursor).toBe("p003");
  });

  it("reprend après le curseur et rend null en fin de table", async () => {
    const refresh = vi.fn(async (id: string) => outcome(id, "unchanged"));
    const r = await runReconcileBatch(
      { cursor: "p003", budgetMs: 1e9, invalidationsLeft: 10 },
      { listIds: listFrom(ids(5)), refresh, now: () => 0 }
    );
    expect(r.processed).toBe(2);
    expect(r.cursor).toBeNull();
  });

  it("parcourt plusieurs pages de 50", async () => {
    const refresh = vi.fn(async (id: string) => outcome(id, "unchanged"));
    const listIdsFn = listFrom(ids(120));
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 10 },
      { listIds: listIdsFn, refresh, now: () => 0 }
    );
    expect(r.processed).toBe(120);
    expect(r.cursor).toBeNull();
    expect(listIdsFn).toHaveBeenCalledWith(null, 50);
    expect(listIdsFn).toHaveBeenCalledWith("p050", 50);
  });

  it("écrit sans invalider une fois le plafond atteint", async () => {
    const calls: { id: string; revalidate: unknown; keepNonPublic: unknown }[] = [];
    const refresh = vi.fn(
      async (
        id: string,
        _reason: string,
        deps?: { revalidate?: (t: string) => void; keepNonPublic?: boolean }
      ) => {
        calls.push({ id, revalidate: deps?.revalidate, keepNonPublic: deps?.keepNonPublic });
        return outcome(id, "updated");
      }
    );
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 2 },
      { listIds: listFrom(ids(5)), refresh, now: () => 0 }
    );
    expect(r).toMatchObject({ updated: 5, invalidated: 2, deferred: 3 });
    // Deferred ones get a no-op revalidate, the first two get the default (undefined deps).
    expect(calls[0]?.revalidate).toBeUndefined();
    expect(typeof calls[2]?.revalidate).toBe("function");
  });

  it("garde, au-delà du plafond, le document d'une fiche dépubliée entre listage et calcul", async () => {
    const calls: { id: string; keepNonPublic: unknown }[] = [];
    const refresh = vi.fn(
      async (id: string, _reason: string, deps?: { keepNonPublic?: boolean }) => {
        calls.push({ id, keepNonPublic: deps?.keepNonPublic });
        return outcome(id, "updated");
      }
    );
    await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 1 },
      { listIds: listFrom(ids(3)), refresh, now: () => 0 }
    );
    // Within the cap the default refresh removes it with an invalidation; past it, it stays.
    expect(calls).toEqual([
      { id: "p001", keepNonPublic: undefined },
      { id: "p002", keepNonPublic: true },
      { id: "p003", keepNonPublic: true },
    ]);
  });

  it("compte les documents supprimés et les impute au plafond d'invalidations", async () => {
    const refresh = vi.fn(async (id: string) => outcome(id, "not-public", id !== "p003"));
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 2 },
      { listIds: listFrom(ids(4)), refresh, now: () => 0 }
    );
    expect(r).toMatchObject({ processed: 4, updated: 0, removed: 3, invalidated: 2, deferred: 1 });
  });

  it("laisse en place et compte les orphelins une fois le plafond atteint", async () => {
    const refresh = vi.fn(async (id: string) => outcome(id, "not-public", true));
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 1, orphans: true },
      { listIds: listFrom(ids(3)), refresh, now: () => 0 }
    );
    expect(refresh).toHaveBeenCalledExactlyOnceWith("p001", "reconcile");
    expect(r).toMatchObject({ removed: 1, invalidated: 1, deferred: 0, orphansDeferred: 2 });
    expect(r.cursor).toBeNull();
  });

  it("compte un échec sans interrompre le lot", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refresh = vi.fn(async (id: string) => {
      if (id === "p003") throw new Error("boom");
      return outcome(id, "unchanged");
    });
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 10 },
      { listIds: listFrom(ids(5)), refresh, now: () => 0 }
    );
    expect(r).toMatchObject({ processed: 5, failures: 1, failedIds: ["p003"] });
    const logged = errorSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(logged).toEqual([
      {
        event: "[profile-snapshot] reconcile failure",
        politicianId: "p003",
        message: "boom",
      },
    ]);
    errorSpy.mockRestore();
  });
});
