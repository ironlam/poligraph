import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata only reads the party row.
const getParty = vi.fn();
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/data/partis", () => ({
  getParty: (slug: string) => getParty(slug),
  getPartyLeadership: vi.fn(async () => []),
  getPartyRoles: vi.fn(async () => []),
}));
vi.mock("@/lib/data/platforms", () => ({ getPartyPlatform: vi.fn(async () => null) }));

import { generateMetadata } from "@/app/partis/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => getParty.mockReset());

describe("/partis/[slug] metadata", () => {
  it("noindex un parti inexistant au lieu de l'offrir à l'indexation", async () => {
    getParty.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Parti non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un parti existant", async () => {
    getParty.mockResolvedValue({
      name: "Parti Public",
      shortName: "PP",
      description: "Un parti documenté.",
      logoUrl: null,
      politicalPosition: null,
      politicians: [{ id: "p1" }],
      affairsAtTime: [],
    });

    const m = await metadataFor("parti-public");

    expect(m.title).toBe("Parti Public (PP)");
    expect(m.description).toBe("Un parti documenté.");
    expect(m.alternates?.canonical).toBe("/partis/parti-public");
    expect(m.robots).toBeUndefined();
  });
});
