// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Lets a test run code between a refresh's write and its pending-invalidation mark, to stand in
// for a later build landing in between. Inactive unless a test sets it.
const hooks = vi.hoisted(() => ({ beforeMark: null as null | (() => Promise<void>) }));
vi.mock("../store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    markProfileSnapshotPendingInvalidation: async (
      input: Parameters<typeof actual.markProfileSnapshotPendingInvalidation>[0]
    ) => {
      if (hooks.beforeMark) await hooks.beforeMark();
      return actual.markProfileSnapshotPendingInvalidation(input);
    },
  };
});

let db: typeof import("@/lib/db").db;
let refreshPoliticianProfile: typeof import("../refresh").refreshPoliticianProfile;
let writeProfileSnapshot: typeof import("../store").writeProfileSnapshot;
let readDatabaseNow: typeof import("../store").readDatabaseNow;
let PENDING_INVALIDATION_HASH: string;

const SLUG = "profile-snapshot-refresh";

async function storedRow(politicianId: string) {
  return db.politicianProfileSnapshot.findUnique({ where: { politicianId } });
}

describeIfDisposableDb("recalcul d'une fiche politicien", () => {
  let politicianId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ refreshPoliticianProfile } = await import("../refresh"));
    ({ writeProfileSnapshot, readDatabaseNow, PENDING_INVALIDATION_HASH } =
      await import("../store"));

    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    const politician = await db.politician.create({
      data: {
        slug: `${SLUG}-elu`,
        firstName: "Dominique",
        lastName: "Fictive",
        fullName: "Dominique Fictive",
        publicationStatus: "PUBLISHED",
      },
    });
    politicianId = politician.id;
  });

  beforeEach(async () => {
    hooks.beforeMark = null;
    vi.spyOn(console, "info").mockImplementation(() => {});
    await db.politicianProfileSnapshot.deleteMany({ where: { politicianId } });
    await db.politician.update({
      where: { id: politicianId },
      data: { publicationStatus: "PUBLISHED", firstName: "Dominique", slug: `${SLUG}-elu` },
    });
  });

  afterAll(async () => {
    await db?.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
  });

  it("date le calcul à l'horloge de la base, pas à celle du serveur", async () => {
    const before = await readDatabaseNow();
    // A server clock years behind the database: a build dated by it would land outside the
    // window read from the database around the refresh.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2001-01-01T00:00:00.000Z") });
    try {
      await refreshPoliticianProfile(politicianId, "test", { revalidate: () => {} });
    } finally {
      vi.useRealTimers();
    }
    const after = await readDatabaseNow();
    const builtAt = (await storedRow(politicianId))!.builtAt;
    expect(builtAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(builtAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("l'horloge de la base se relit à l'identique dans builtAt et la sentinelle la retrouve", async () => {
    const { buildPoliticianProfileDocument } = await import("../build");
    const { markProfileSnapshotPendingInvalidation } = await import("../store");
    const startedAt = await readDatabaseNow();
    const doc = await buildPoliticianProfileDocument({ id: politicianId });
    await writeProfileSnapshot({ politicianId, document: doc!, startedAt });
    expect((await storedRow(politicianId))!.builtAt).toEqual(startedAt);
    expect(await markProfileSnapshotPendingInvalidation({ politicianId, builtAt: startedAt })).toBe(
      true
    );
    expect((await storedRow(politicianId))?.contentHash).toBe(PENDING_INVALIDATION_HASH);
  });

  /** Stores a first document, then changes a displayed field so the next build differs. */
  async function storeThenChange() {
    await refreshPoliticianProfile(politicianId, "test", { revalidate: () => {} });
    await db.politician.update({ where: { id: politicianId }, data: { firstName: "Dominika" } });
  }

  it("retente l'invalidation après un échec, même si le contenu n'a plus changé", async () => {
    await storeThenChange();
    const failing = vi.fn().mockRejectedValue(new Error("revalidate indisponible"));
    await expect(
      refreshPoliticianProfile(politicianId, "test", { revalidate: failing })
    ).rejects.toThrow("revalidate indisponible");
    expect((await storedRow(politicianId))?.contentHash).toBe(PENDING_INVALIDATION_HASH);

    // The retry builds the same content as the failed attempt.
    const revalidate = vi.fn();
    const retry = await refreshPoliticianProfile(politicianId, "test", { revalidate });
    expect(retry.status).toBe("updated");
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(`politician:${SLUG}-elu`);
    expect((await storedRow(politicianId))?.contentHash).not.toBe(PENDING_INVALIDATION_HASH);
  });

  it("n'écrit pas la sentinelle sur une ligne réécrite entre-temps par un calcul plus récent", async () => {
    await storeThenChange();
    const { buildPoliticianProfileDocument } = await import("../build");
    let laterHash: string | undefined;
    const failing = vi.fn(async () => {
      // A later build stores its own document before this invalidation fails.
      const doc = await buildPoliticianProfileDocument({ id: politicianId });
      await writeProfileSnapshot({
        politicianId,
        document: doc!,
        startedAt: new Date(Date.now() + 60_000),
      });
      laterHash = (await storedRow(politicianId))?.contentHash;
      throw new Error("revalidate indisponible");
    });
    await expect(
      refreshPoliticianProfile(politicianId, "test", { revalidate: failing })
    ).rejects.toThrow("revalidate indisponible");
    expect(laterHash).toBeDefined();
    expect((await storedRow(politicianId))?.contentHash).toBe(laterHash);
  });

  async function unpublish(data: { slug?: string } = {}) {
    await db.politician.update({
      where: { id: politicianId },
      data: { publicationStatus: "DRAFT", ...data },
    });
  }

  it("invalide le slug du document stocké puis supprime le document d'une fiche dépubliée", async () => {
    await refreshPoliticianProfile(politicianId, "test", { revalidate: () => {} });
    // The slug changes with the unpublication: the cached page lives at the stored one.
    await unpublish({ slug: `${SLUG}-renomme` });
    let rowAtInvalidation: unknown;
    const revalidate = vi.fn(async () => {
      rowAtInvalidation = await storedRow(politicianId);
    });
    const outcome = await refreshPoliticianProfile(politicianId, "test", { revalidate });
    expect(outcome).toMatchObject({ status: "not-public", removed: true });
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(`politician:${SLUG}-elu`);
    expect(rowAtInvalidation).not.toBeNull();
    expect(await storedRow(politicianId)).toBeNull();
  });

  it("ne fait rien pour une fiche dépubliée sans document", async () => {
    await unpublish();
    const revalidate = vi.fn();
    const outcome = await refreshPoliticianProfile(politicianId, "test", { revalidate });
    expect(outcome).toMatchObject({ status: "not-public", removed: false });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("ne supprime pas un document écrit par un calcul plus récent", async () => {
    const { buildPoliticianProfileDocument } = await import("../build");
    const doc = await buildPoliticianProfileDocument({ id: politicianId });
    await writeProfileSnapshot({
      politicianId,
      document: doc!,
      startedAt: new Date(Date.now() + 60_000),
    });
    await unpublish();
    const revalidate = vi.fn();
    const outcome = await refreshPoliticianProfile(politicianId, "test", { revalidate });
    expect(outcome).toMatchObject({ status: "not-public", removed: false });
    expect(revalidate).not.toHaveBeenCalled();
    expect(await storedRow(politicianId)).not.toBeNull();
  });

  it("la suppression épargne une ligne écrite après le début du calcul", async () => {
    const { deleteProfileSnapshotBuiltBefore } = await import("../store");
    const startedAt = new Date();
    const { buildPoliticianProfileDocument } = await import("../build");
    const doc = await buildPoliticianProfileDocument({ id: politicianId });
    await writeProfileSnapshot({
      politicianId,
      document: doc!,
      startedAt: new Date(startedAt.getTime() + 1),
    });
    expect(await deleteProfileSnapshotBuiltBefore({ politicianId, before: startedAt })).toBe(false);
    expect(await storedRow(politicianId)).not.toBeNull();
    expect(
      await deleteProfileSnapshotBuiltBefore({
        politicianId,
        before: new Date(startedAt.getTime() + 2),
      })
    ).toBe(true);
    expect(await storedRow(politicianId)).toBeNull();
  });

  it("le rattrapage traite et compte le document orphelin d'une fiche dépubliée", async () => {
    const { listOrphanProfileSnapshotIds, runReconcileBatch } = await import("../reconcile");
    const other = await db.politician.create({
      data: {
        slug: `${SLUG}-publie`,
        firstName: "Morgane",
        lastName: "Fictive",
        fullName: "Morgane Fictive",
        publicationStatus: "PUBLISHED",
      },
    });
    await refreshPoliticianProfile(other.id, "test", { revalidate: () => {} });
    await refreshPoliticianProfile(politicianId, "test", { revalidate: () => {} });
    await unpublish();

    const orphans = await listOrphanProfileSnapshotIds(null, 50);
    expect(orphans).toContain(politicianId);
    expect(orphans).not.toContain(other.id);

    const revalidate = vi.fn();
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 10 },
      {
        listIds: (cursor, take) =>
          listOrphanProfileSnapshotIds(cursor, take).then((list) =>
            list.filter((id) => id === politicianId)
          ),
        refresh: (id, reason) => refreshPoliticianProfile(id, reason, { revalidate }),
        now: Date.now,
      }
    );
    expect(r).toMatchObject({ processed: 1, removed: 1, invalidated: 1, failures: 0 });
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(`politician:${SLUG}-elu`);
    expect(await storedRow(politicianId)).toBeNull();
    expect(await storedRow(other.id)).not.toBeNull();
  });

  it("le rattrapage laisse en place un orphelin au-delà du plafond, sans l'invalider", async () => {
    const { runReconcileBatch } = await import("../reconcile");
    await refreshPoliticianProfile(politicianId, "test", { revalidate: () => {} });
    await unpublish();
    const revalidate = vi.fn();
    const r = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 0, orphans: true },
      {
        listIds: async (cursor) => (cursor ? [] : [politicianId]),
        refresh: (id, reason) => refreshPoliticianProfile(id, reason, { revalidate }),
        now: Date.now,
      }
    );
    expect(r).toMatchObject({ orphansDeferred: 1, removed: 0, invalidated: 0 });
    expect(revalidate).not.toHaveBeenCalled();
    expect(await storedRow(politicianId)).not.toBeNull();
  });
  it("au-delà du plafond, la passe publique garde sans l'invalider le document d'une fiche dépubliée entre listage et calcul", async () => {
    const { listOrphanProfileSnapshotIds, runReconcileBatch } = await import("../reconcile");
    await refreshPoliticianProfile(politicianId, "test", { revalidate: () => {} });
    const revalidate = vi.fn();
    const pastCap = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 0 },
      {
        // Listed while public, unpublished before its build.
        listIds: async (cursor) => {
          if (cursor) return [];
          await unpublish();
          return [politicianId];
        },
        refresh: (id, reason, deps) =>
          refreshPoliticianProfile(id, reason, {
            ...deps,
            revalidate: deps?.revalidate ?? revalidate,
          }),
        now: Date.now,
      }
    );
    expect(pastCap).toMatchObject({ processed: 1, removed: 0, deferred: 0, failures: 0 });
    expect(revalidate).not.toHaveBeenCalled();
    expect(await storedRow(politicianId)).not.toBeNull();

    // The next run's orphan walk removes it, invalidating the stored slug first.
    const next = await runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft: 10, orphans: true },
      {
        listIds: (cursor, take) =>
          listOrphanProfileSnapshotIds(cursor, take).then((list) =>
            list.filter((id) => id === politicianId)
          ),
        refresh: (id, reason) => refreshPoliticianProfile(id, reason, { revalidate }),
        now: Date.now,
      }
    );
    expect(next).toMatchObject({ removed: 1, invalidated: 1 });
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(`politician:${SLUG}-elu`);
    expect(await storedRow(politicianId)).toBeNull();
  });

  /** One public-walk batch over this politician only, with `invalidationsLeft` budget. */
  async function publicWalk(invalidationsLeft: number, revalidate: (tag: string) => void) {
    const { runReconcileBatch } = await import("../reconcile");
    return runReconcileBatch(
      { cursor: null, budgetMs: 1e9, invalidationsLeft },
      {
        listIds: async (cursor) => (cursor ? [] : [politicianId]),
        refresh: (id, reason, deps) =>
          refreshPoliticianProfile(id, reason, {
            ...deps,
            revalidate: deps?.revalidate ?? revalidate,
          }),
        now: Date.now,
      }
    );
  }

  it("au-delà du plafond, la passe publique marque en attente le document modifié, et le run suivant l'invalide", async () => {
    await storeThenChange();
    const revalidate = vi.fn();
    const pastCap = await publicWalk(0, revalidate);
    expect(pastCap).toMatchObject({ processed: 1, updated: 1, invalidated: 0, deferred: 1 });
    expect(revalidate).not.toHaveBeenCalled();
    expect((await storedRow(politicianId))?.contentHash).toBe(PENDING_INVALIDATION_HASH);

    // Same content as the deferred write: without the mark, this run would see "unchanged".
    const next = await publicWalk(10, revalidate);
    expect(next).toMatchObject({ updated: 1, invalidated: 1, deferred: 0 });
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(`politician:${SLUG}-elu`);
    expect((await storedRow(politicianId))?.contentHash).not.toBe(PENDING_INVALIDATION_HASH);
  });

  it("au-delà du plafond, ne marque pas une ligne réécrite entre-temps par un calcul plus récent", async () => {
    await storeThenChange();
    const { buildPoliticianProfileDocument } = await import("../build");
    let laterHash: string | undefined;
    hooks.beforeMark = async () => {
      const doc = await buildPoliticianProfileDocument({ id: politicianId });
      await writeProfileSnapshot({
        politicianId,
        document: doc!,
        startedAt: new Date(Date.now() + 60_000),
      });
      laterHash = (await storedRow(politicianId))?.contentHash;
    };
    const r = await publicWalk(0, vi.fn());
    expect(r).toMatchObject({ updated: 1, deferred: 1, failures: 0 });
    expect(laterHash).toBeDefined();
    expect(laterHash).not.toBe(PENDING_INVALIDATION_HASH);
    expect((await storedRow(politicianId))?.contentHash).toBe(laterHash);
  });
});
