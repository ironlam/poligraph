import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  affairCount: vi.fn(),
  getPublicPartyMetadataBySlug: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { affair: { count: mocks.affairCount } },
}));
vi.mock("@/lib/data/affairs", () => ({
  getPartiesWithAffairs: vi.fn(),
  getPublicPartyMetadataBySlug: mocks.getPublicPartyMetadataBySlug,
}));
vi.mock("@/lib/data/condamnations", () => ({
  getCondamnations: vi.fn(),
  getCondamnationsStatsByParty: vi.fn(),
}));

import { generateMetadata } from "./page";

const metadataForParty = (parti?: string) =>
  generateMetadata({
    searchParams: Promise.resolve(parti ? { parti } : {}),
  });

describe("metadata /affaires/condamnations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.affairCount.mockResolvedValue(0);
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue(null);
  });

  it("rend une metadata générique identique pour un parti caché et un parti inexistant", async () => {
    const hidden = await metadataForParty("parti-interne");
    const missing = await metadataForParty("parti-inexistant");

    expect(hidden).toEqual(missing);
    expect(hidden.alternates?.canonical).toBe("/affaires/condamnations");
    expect(JSON.stringify(hidden)).not.toContain("parti-interne");
    expect(JSON.stringify(hidden)).not.toContain("Parti interne");
  });

  it("conserve la metadata spécifique d'un parti public", async () => {
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue({
      name: "Parti public",
      shortName: "PP",
    });

    const metadata = await metadataForParty("parti-public");

    expect(metadata.title).toContain("Parti public (PP)");
    expect(metadata.alternates?.canonical).toBe("/affaires/parti/parti-public");
  });

  it("construit la description avec les deux compteurs limités aux personnalités publiées", async () => {
    mocks.affairCount.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      const sharesPublicBoundary =
        where.publicationStatus === "PUBLISHED" &&
        JSON.stringify(where.politician) === JSON.stringify({ publicationStatus: "PUBLISHED" });

      if (!sharesPublicBoundary) return 99;
      if (where.status === "CONDAMNATION_DEFINITIVE") return 1;
      return 2;
    });

    const metadata = await metadataForParty();

    expect(metadata.description).toContain(
      "1 responsables politiques français condamnés définitivement et 2 en première instance"
    );
    expect(metadata.description).not.toContain("99");
    expect(mocks.affairCount).toHaveBeenCalledTimes(2);
    expect(mocks.affairCount).toHaveBeenNthCalledWith(1, {
      where: {
        publicationStatus: "PUBLISHED",
        politician: { publicationStatus: "PUBLISHED" },
        involvement: { in: ["DIRECT", "INDIRECT"] },
        status: "CONDAMNATION_DEFINITIVE",
      },
    });
    expect(mocks.affairCount).toHaveBeenNthCalledWith(2, {
      where: {
        publicationStatus: "PUBLISHED",
        politician: { publicationStatus: "PUBLISHED" },
        involvement: { in: ["DIRECT", "INDIRECT"] },
        status: { in: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"] },
      },
    });
  });
});
