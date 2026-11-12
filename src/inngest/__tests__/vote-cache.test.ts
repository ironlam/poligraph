import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTags = vi.hoisted(() => vi.fn());
const requestProfileReconcile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache", () => ({ revalidateTags }));
vi.mock("@/lib/politicians/profile-snapshot/events", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/politicians/profile-snapshot/events")>()),
  requestProfileReconcile,
}));

import { runVoteSyncWithCacheInvalidation } from "../vote-cache";

const NOTHING_WRITTEN = { scrutinsCreated: 0, scrutinsUpdated: 0, votesCreated: 0 };

describe("runVoteSyncWithCacheInvalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        return { ...NOTHING_WRITTEN, scrutinsCreated: 1, votesCreated: 1 };
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

  it("n'invalide pas quand la synchronisation n'a rien écrit", async () => {
    // Unchanged archive (HTTP 304 or same hash) or nothing new past the Senate cursor: purging
    // "votes" here restaled every profile and listing of the site for no data change.
    const result = await runVoteSyncWithCacheInvalidation(async () => ({
      ...NOTHING_WRITTEN,
      scrutinsSkipped: 12,
      votesSkipped: 4000,
    }));

    expect(revalidateTags).not.toHaveBeenCalled();
    expect(result.scrutinsSkipped).toBe(12);
  });

  it.each(["scrutinsCreated", "scrutinsUpdated", "votesCreated"] as const)(
    "invalide dès que %s est non nul",
    async (counter) => {
      await runVoteSyncWithCacheInvalidation(async () => ({ ...NOTHING_WRITTEN, [counter]: 1 }));
      expect(revalidateTags).toHaveBeenCalledExactlyOnceWith(["votes"], "max");
    }
  );

  it("demande un rattrapage des fiches après le sync", async () => {
    await runVoteSyncWithCacheInvalidation(async () => ({ ...NOTHING_WRITTEN, votesCreated: 1 }));
    expect(requestProfileReconcile).toHaveBeenCalledExactlyOnceWith("sync-scrutins");
  });

  it("ne demande pas de rattrapage quand le sync échoue", async () => {
    await expect(
      runVoteSyncWithCacheInvalidation(async () => {
        throw new Error("sync failed");
      })
    ).rejects.toThrow("sync failed");
    expect(requestProfileReconcile).not.toHaveBeenCalled();
  });
});
