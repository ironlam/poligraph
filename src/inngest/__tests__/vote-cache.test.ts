import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTags = vi.hoisted(() => vi.fn());
const requestProfileReconcile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache", () => ({ revalidateTags }));
vi.mock("@/lib/politicians/profile-snapshot/events", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/politicians/profile-snapshot/events")>()),
  requestProfileReconcile,
}));

import { runVoteSyncWithCacheInvalidation } from "../vote-cache";

describe("runVoteSyncWithCacheInvalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    [["AN"], "SENAT"],
    [["SENAT"], "AN"],
  ] as const)(
    "invalide une couverture %j quand le premier vote %s est synchronisé",
    async (initialCoverage, addedChamber) => {
      const corpus = [...initialCoverage];
      let cachedCoverage: readonly string[] | null = [...initialCoverage];
      const readCoverage = () => {
        cachedCoverage ??= [...corpus];
        return cachedCoverage;
      };
      revalidateTags.mockImplementation(() => {
        cachedCoverage = null;
      });

      expect(readCoverage()).toEqual(initialCoverage);
      await runVoteSyncWithCacheInvalidation(async () => {
        corpus.push(addedChamber);
        return { votesCreated: 1 };
      });

      expect(revalidateTags).toHaveBeenCalledExactlyOnceWith(["votes"], "max");
      expect(new Set(readCoverage())).toEqual(new Set(["AN", "SENAT"]));
    }
  );

  it("n'invalide pas avant une synchronisation réussie", async () => {
    await expect(
      runVoteSyncWithCacheInvalidation(async () => {
        throw new Error("sync failed");
      })
    ).rejects.toThrow("sync failed");
    expect(revalidateTags).not.toHaveBeenCalled();
  });

  it("ne demande pas de rattrapage des fiches sans l'interrupteur", async () => {
    await runVoteSyncWithCacheInvalidation(async () => ({ votesCreated: 1 }));
    expect(requestProfileReconcile).not.toHaveBeenCalled();
  });

  it('ne demande pas de rattrapage si l\'interrupteur vaut autre chose que "true"', async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "1");
    await runVoteSyncWithCacheInvalidation(async () => ({ votesCreated: 1 }));
    expect(requestProfileReconcile).not.toHaveBeenCalled();
  });

  it('demande un rattrapage des fiches après le sync quand l\'interrupteur vaut "true"', async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "true");
    await runVoteSyncWithCacheInvalidation(async () => ({ votesCreated: 1 }));
    expect(requestProfileReconcile).toHaveBeenCalledExactlyOnceWith("sync-scrutins");
  });

  it("ne demande pas de rattrapage quand le sync échoue", async () => {
    vi.stubEnv("PROFILE_SNAPSHOT_AUTO_RECONCILE", "true");
    await expect(
      runVoteSyncWithCacheInvalidation(async () => {
        throw new Error("sync failed");
      })
    ).rejects.toThrow("sync failed");
    expect(requestProfileReconcile).not.toHaveBeenCalled();
  });
});
