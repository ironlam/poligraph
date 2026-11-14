import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    factCheck: { count: mocks.count, groupBy: mocks.groupBy },
    $queryRaw: mocks.queryRaw,
  },
}));

import { classifyRating, factcheckStatsService } from "./factcheckStats";

describe("statistiques publiques des fact-checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.groupBy.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("aplatit le prédicat public dans la requête Prisma au lieu de le lier comme une valeur", async () => {
    await factcheckStatsService.getStatisticsData();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    const call = mocks.queryRaw.mock.calls[0] ?? [];
    expect(call).toHaveLength(1);
    expect(call[0]).toMatchObject({
      sql: expect.stringContaining('fc."publicationStatus" = ?'),
      values: expect.arrayContaining(["PUBLISHED"]),
    });
    expect(call[0].values.every((value: unknown) => typeof value !== "object")).toBe(true);
  });

  describe("classifyRating", () => {
    it("classe les verdicts connus dans leur groupe respectif", () => {
      expect(classifyRating("TRUE")).toBe("vrai");
      expect(classifyRating("MOSTLY_TRUE")).toBe("vrai");
      expect(classifyRating("HALF_TRUE")).toBe("trompeur");
      expect(classifyRating("MISLEADING")).toBe("trompeur");
      expect(classifyRating("OUT_OF_CONTEXT")).toBe("trompeur");
      expect(classifyRating("MOSTLY_FALSE")).toBe("faux");
      expect(classifyRating("FALSE")).toBe("faux");
      expect(classifyRating("UNVERIFIABLE")).toBe("inverifiable");
    });

    it("ne mappe jamais un code de verdict inconnu vers UNVERIFIABLE : inconnu ≠ invérifiable", () => {
      expect(classifyRating("SOME_FUTURE_RATING")).toBeNull();
      expect(classifyRating("")).toBeNull();
    });
  });

  describe("getStatisticsData face à un verdictRating inconnu", () => {
    it("exclut les mentions au code inconnu des classements au lieu de les compter comme invérifiable", async () => {
      mocks.count.mockResolvedValue(8);
      mocks.queryRaw.mockResolvedValue([
        {
          politicianId: "pol1",
          fullName: "Jean Test",
          slug: "jean-test",
          photoUrl: null,
          partyName: "Parti Test",
          partyShortName: "PT",
          partyColor: "#000000",
          partySlug: "parti-test",
          verdictRating: "TRUE",
          mentionCount: BigInt(5),
        },
        {
          politicianId: "pol1",
          fullName: "Jean Test",
          slug: "jean-test",
          photoUrl: null,
          partyName: "Parti Test",
          partyShortName: "PT",
          partyColor: "#000000",
          partySlug: "parti-test",
          verdictRating: "SOME_FUTURE_RATING",
          mentionCount: BigInt(3),
        },
      ]);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await factcheckStatsService.getStatisticsData();

      const jean = result.topVraiSharePoliticians.find((p) => p.slug === "jean-test");
      expect(jean).toBeDefined();
      expect(jean!.totalMentions).toBe(5);
      expect(jean!.breakdown.vrai).toBe(5);
      expect(jean!.breakdown.inverifiable).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SOME_FUTURE_RATING"));

      warnSpy.mockRestore();
    });
  });

  describe("partiesByVolume, le tableau qu'une carte de partage imprime", () => {
    const row = (
      pol: string,
      party: string,
      verdictRating: string,
      mentionCount: number
    ): Record<string, unknown> => ({
      politicianId: pol,
      fullName: `Personne ${pol}`,
      slug: pol,
      photoUrl: null,
      partyName: `Parti ${party}`,
      partyShortName: party,
      partyColor: null,
      partySlug: `parti-${party.toLowerCase()}`,
      verdictRating,
      mentionCount: BigInt(mentionCount),
    });

    it("donne tous les partis au-dessus du seuil, du plus vérifié au moins vérifié", async () => {
      mocks.queryRaw.mockResolvedValue([
        row("a", "AAA", "FALSE", 6),
        row("b", "BBB", "TRUE", 20),
        row("c", "CCC", "FALSE", 9),
        row("d", "DDD", "TRUE", 2),
      ]);

      const result = await factcheckStatsService.getStatisticsData();

      // DDD reste sous le seuil de 5 propos ; l'ordre suit le volume, pas la part de faux.
      expect(result.partiesByVolume.map((party) => party.shortName)).toEqual(["BBB", "CCC", "AAA"]);
    });

    it("départage deux partis de même volume par leur nom, pour un ordre stable", async () => {
      mocks.queryRaw.mockResolvedValue([row("z", "ZZZ", "TRUE", 7), row("a", "AAA", "FALSE", 7)]);

      const result = await factcheckStatsService.getStatisticsData();

      expect(result.partiesByVolume.map((party) => party.shortName)).toEqual(["AAA", "ZZZ"]);
    });
  });
});
