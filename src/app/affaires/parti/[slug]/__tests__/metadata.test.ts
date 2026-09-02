import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { party: { findUnique: () => findUnique() } } }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { generateMetadata } from "@/app/affaires/parti/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => findUnique.mockReset());

describe("/affaires/parti/[slug] metadata", () => {
  it("noindex un parti inexistant au lieu de l'offrir à l'indexation", async () => {
    findUnique.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Parti non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un parti existant", async () => {
    findUnique.mockResolvedValue({
      id: "party-1",
      name: "Parti Public",
      shortName: "PP",
      slug: "parti-public",
      logoUrl: null,
      color: null,
      affairsAtTime: [],
    });

    const m = await metadataFor("parti-public");

    expect(m.title).toContain("Parti Public (PP)");
    expect(m.alternates?.canonical).toBe("/affaires/parti/parti-public");
    expect(m.robots).toBeUndefined();
  });
});
