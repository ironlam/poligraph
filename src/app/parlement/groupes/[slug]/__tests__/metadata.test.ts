import { describe, it, expect, vi } from "vitest";

// The page's data layer builds a Prisma client and uses Next cache primitives
// at import time; generateMetadata only needs the group payload.
const getGroupeDetail = vi.fn();
vi.mock("@/lib/data/groupes", () => ({
  getGroupeDetail: (slug: string) => getGroupeDetail(slug),
  getGroupKeyVotes: vi.fn(async () => []),
  getScrutinGroupPositions: vi.fn(async () => []),
  getScrutinAnalysis: vi.fn(async () => null),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { generateMetadata } from "@/app/parlement/groupes/[slug]/page";

const group = (over: Record<string, unknown> = {}) => ({
  name: "Groupe Les Démocrates",
  code: "DEM",
  chamber: "AN",
  seatCount: 36,
  stats: [{ cohesionPct: 91 }],
  ...over,
});

const metadataFor = async (over: Record<string, unknown> = {}) => {
  getGroupeDetail.mockResolvedValue(group(over));
  return generateMetadata({ params: Promise.resolve({ slug: "dem" }) });
};

describe("/parlement/groupes/[slug] metadata", () => {
  it("names the Assemblée nationale for an AN group", async () => {
    const m = await metadataFor();
    expect(m.title).toBe("Groupe Les Démocrates à l'Assemblée nationale : membres et votes");
    expect(m.alternates?.canonical).toBe("/parlement/groupes/dem");
  });

  it("names the Sénat for a Senate group", async () => {
    const m = await metadataFor({ name: "Groupe Les Républicains", code: "LR", chamber: "SENAT" });
    expect(m.title).toBe("Groupe Les Républicains au Sénat : membres et votes");
    expect(m.title).not.toContain("Assemblée nationale");
  });

  it("advertises no participation rate, in either chamber (issue #717)", async () => {
    for (const chamber of ["AN", "SENAT"]) {
      const m = await metadataFor({ chamber });
      expect(String(m.title).toLowerCase()).not.toContain("participation");
      expect(String(m.description).toLowerCase()).not.toContain("participation");
    }
  });

  it("promises no statistic when the group has none computed", async () => {
    const m = await metadataFor({ stats: [] });
    expect(String(m.description)).not.toContain("cohésion");
  });

  it("noindexes an unknown group instead of inviting indexation", async () => {
    getGroupeDetail.mockResolvedValue(null);
    const m = await generateMetadata({ params: Promise.resolve({ slug: "x-bidon" }) });
    expect(m.title).toBe("Groupe non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("leaves an existing group's metadata untouched", async () => {
    const m = await metadataFor();
    expect(m.robots).toBeUndefined();
  });
});
