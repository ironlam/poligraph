import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicPartyMetadataBySlug: vi.fn(),
}));

vi.mock("@/lib/data/affairs", () => ({
  getAffairs: vi.fn(),
  getSuperCategoryCounts: vi.fn(),
  getCertaintyCounts: vi.fn(),
  getPartiesWithAffairs: vi.fn(),
  getPublicPartyMetadataBySlug: mocks.getPublicPartyMetadataBySlug,
}));

import { generateMetadata } from "./page";

const metadataForParty = (parti: string) =>
  generateMetadata({ searchParams: Promise.resolve({ parti }) });

describe("metadata /affaires avec filtre Party", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue(null);
  });

  it("rend une metadata générique identique pour un parti caché et un parti inexistant", async () => {
    const hidden = await metadataForParty("parti-interne");
    const missing = await metadataForParty("parti-inexistant");

    expect(hidden).toEqual(missing);
    expect(hidden.alternates?.canonical).toBe("/affaires");
    expect(JSON.stringify(hidden)).not.toContain("parti-interne");
    expect(JSON.stringify(hidden)).not.toContain("Parti interne");
    expect(mocks.getPublicPartyMetadataBySlug).toHaveBeenNthCalledWith(1, "parti-interne");
    expect(mocks.getPublicPartyMetadataBySlug).toHaveBeenNthCalledWith(2, "parti-inexistant");
  });

  it("conserve la metadata spécifique d'un parti public", async () => {
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue({
      name: "Parti public",
      shortName: "PP",
    });

    const metadata = await metadataForParty("parti-public");

    expect(metadata.title).toContain("Parti public (PP)");
    expect(metadata.description).toContain("Parti public");
    expect(metadata.alternates?.canonical).toBe("/affaires?parti=parti-public");
  });
});
