// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let refreshPoliticianProfile: typeof import("../refresh").refreshPoliticianProfile;
let writeProfileSnapshot: typeof import("../store").writeProfileSnapshot;
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
    ({ writeProfileSnapshot, PENDING_INVALIDATION_HASH } = await import("../store"));

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
    vi.spyOn(console, "info").mockImplementation(() => {});
    await db.politicianProfileSnapshot.deleteMany({ where: { politicianId } });
    await db.politician.update({
      where: { id: politicianId },
      data: { publicationStatus: "PUBLISHED", firstName: "Dominique" },
    });
  });

  afterAll(async () => {
    await db?.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
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
});
