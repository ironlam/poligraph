import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata reads a single type × chamber groupBy; the listing queries
// never run here. Stub Prisma so the module imports with no DATABASE_URL.
const groupBy = vi.fn();
vi.mock("@/lib/db", () => ({ db: { scrutin: { groupBy: () => groupBy() } } }));

import { generateMetadata } from "@/app/parlement/votes/themes/[theme]/page";

const BOTH_CHAMBERS = [
  { type: "ORDINAIRE", chamber: "AN", _count: 80 },
  { type: "AMENDEMENT", chamber: "AN", _count: 40 },
  { type: "ORDINAIRE", chamber: "SENAT", _count: 22 },
];

const metadataFor = (slug: string, counts = BOTH_CHAMBERS, sp: Record<string, string> = {}) => {
  groupBy.mockResolvedValue(counts);
  return generateMetadata({
    params: Promise.resolve({ theme: slug }),
    searchParams: Promise.resolve(sp),
  });
};

beforeEach(() => groupBy.mockReset());

describe("/parlement/votes/themes/[theme] metadata", () => {
  it("builds a descriptive title for a feminine theme", async () => {
    const m = await metadataFor("sante");
    expect(m.title).toBe("Votes sur la santé à l'Assemblée nationale et au Sénat");
    expect(m.description).toBe(
      "Consultez les votes du Parlement sur la santé : scrutins de l'Assemblée nationale et du Sénat, résultats, textes de loi et amendements."
    );
    expect(m.alternates?.canonical).toBe("/parlement/votes/themes/sante");
  });

  it("elides correctly instead of injecting the raw label", async () => {
    expect((await metadataFor("economie-budget")).title).toBe(
      "Votes sur l'économie et le budget à l'Assemblée nationale et au Sénat"
    );
    expect((await metadataFor("immigration")).title).toBe(
      "Votes sur l'immigration à l'Assemblée nationale et au Sénat"
    );
    expect((await metadataFor("environnement-energie")).title).toBe(
      "Votes sur l'environnement et l'énergie à l'Assemblée nationale et au Sénat"
    );
    expect((await metadataFor("securite-justice")).title).toBe(
      "Votes sur la sécurité et la justice à l'Assemblée nationale et au Sénat"
    );
  });

  it("never claims Senate coverage a theme does not have", async () => {
    const m = await metadataFor("immigration", [{ type: "ORDINAIRE", chamber: "AN", _count: 12 }]);
    expect(m.title).toBe("Votes sur l'immigration à l'Assemblée nationale");
    expect(String(m.description)).not.toContain("Sénat");
  });

  it("keeps the bare landing indexable and its tab variants noindex", async () => {
    const bare = await metadataFor("sante");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((bare.robots as any)?.index).not.toBe(false);

    const tab = await metadataFor("sante", BOTH_CHAMBERS, { type: "amendements" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((tab.robots as any)?.index).toBe(false);
    expect(tab.alternates?.canonical).toBe("/parlement/votes/themes/sante");

    const paginated = await metadataFor("sante", BOTH_CHAMBERS, { page: "2" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((paginated.robots as any)?.index).toBe(false);
  });

  it("does not query the database for an unknown theme", async () => {
    const m = await generateMetadata({
      params: Promise.resolve({ theme: "theme-inexistant" }),
      searchParams: Promise.resolve({}),
    });
    expect(m.title).toBe("Thème introuvable");
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("noindexes an unknown theme instead of inviting indexation", async () => {
    const m = await generateMetadata({
      params: Promise.resolve({ theme: "theme-inexistant" }),
      searchParams: Promise.resolve({}),
    });
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});
