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
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

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
    // Les deux compteurs ne retiennent que la condamnation pénale de la personne mise en cause.
    const [definitive, nonDefinitive] = mocks.affairCount.mock.calls.map(
      (call) => (call[0] as { where: Record<string, unknown> }).where
    );
    const matched = (where: Record<string, unknown>) =>
      ATTRIBUTION_ROWS.filter((row) => evaluateWhere(row, where)).map((row) => row.key);
    expect(matched(definitive!)).toEqual(["directPenalConvicted"]);
    expect(matched({ ...nonDefinitive!, status: "CONDAMNATION_DEFINITIVE" })).toEqual([
      "directPenalConvicted",
    ]);
    expect(nonDefinitive!.status).toEqual({
      in: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"],
    });
  });
});
