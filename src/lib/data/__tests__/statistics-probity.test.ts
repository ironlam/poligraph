import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVICTION_ROWS } from "@/lib/affairs/__tests__/fixtures/conviction-rows";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

type Where = Record<string, unknown>;
type Args = { where: Where; by: string[] };

const PARTY = { name: "Parti test", shortName: "PT", color: "#000", slug: "pt" };

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { affair: { groupBy: mocks.groupBy, findMany: mocks.findMany } },
}));
vi.mock("@/services/voteStats", () => ({ voteStatsService: {} }));
vi.mock("@/services/factcheckStats", () => ({ factcheckStatsService: {} }));

import { getJudicialData } from "@/lib/data/statistics";

const ENTRIES = Object.entries(CONVICTION_ROWS);
const matching = (where: Where) => ENTRIES.filter(([, r]) => evaluateWhere(r, where));

describe("getJudicialData, probité par catégorie", () => {
  beforeEach(() => {
    mocks.groupBy.mockImplementation(async ({ where, by }: Args) => {
      const field = by[0] as string;
      const counts = new Map<string, number>();
      for (const [, r] of matching(where)) {
        const key = String((r as unknown as Record<string, unknown>)[field]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts].map(([value, count]) => ({
        [field]: value,
        _count: { [field]: count },
      }));
    });
    mocks.findMany.mockImplementation(async ({ where }: Args) =>
      matching(where).map(([name, r]) => ({
        ...r,
        politicianId: name,
        politician: { currentParty: PARTY },
      }))
    );
  });

  it("le graphique probité ne dépend pas de la gravité : corruption oui, haine et financement non", async () => {
    const data = await getJudicialData();
    expect(data.critiqueByCategory.map((c) => c.category)).toEqual(["CORRUPTION"]);
    // définitive, première instance, appel, pourvoi, mise en examen
    expect(data.critiqueByCategory[0]?.total).toBe(5);
  });

  it("la requête probité n'a pas de critère de gravité", async () => {
    await getJudicialData();
    const wheres = (mocks.findMany.mock.calls as unknown as [{ where: Where }][]).map(
      ([a]) => a.where
    );
    const probity = wheres.find((w) => "category" in w);
    expect(probity).toBeDefined();
    expect(JSON.stringify(probity)).not.toContain("severity");
    const kept = matching(probity!).map(([name]) => name);
    expect(kept).not.toContain("definitiveHateCritique");
    expect(kept).not.toContain("definitiveCampaignFinancing");
    expect(kept).toContain("miseEnExamen");
    expect(kept).not.toContain("preliminaryInquiry");
    expect(kept).not.toContain("relaxe");
  });

  it("compteurs par stade et compteurs d'élus portent sur la même population DIRECT pénale", async () => {
    const data = await getJudicialData();
    const penalDirect = ENTRIES.filter(([, r]) => r.jurisdictionOrder === "PENAL");
    const statusTotal = data.byStatus.reduce((s, x) => s + x.count, 0);
    const maturityTotal = Object.values(data.maturityCounts).reduce((s, n) => s + n, 0);
    expect(statusTotal).toBe(penalDirect.length);
    expect(maturityTotal).toBe(penalDirect.length);
    expect(data.byStatus.map((s) => s.status)).not.toContain("CONDAMNATION_DEFINITIVE_NON_PENALE");
    // un élu par ligne dans la fixture : 7 condamnations pénales, 1 mise en examen
    expect(data.uniqueCondamnes).toBe(
      penalDirect.filter(([n]) =>
        [
          "definitiveCorruptionGrave",
          "definitiveHateCritique",
          "definitiveCampaignFinancing",
          "firstInstanceCorruption",
          "appealCorruption",
          "cassationCorruption",
        ].includes(n)
      ).length
    );
    expect(data.uniqueMisEnCause).toBe(1);
  });
});
