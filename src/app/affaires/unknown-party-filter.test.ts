import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAffairs: vi.fn(),
  getPartiesWithAffairs: vi.fn(),
  getPublicPartyMetadataBySlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/data/affairs", () => ({
  getAffairs: mocks.getAffairs,
  getSuperCategoryCounts: vi.fn().mockResolvedValue({}),
  getCertaintyCounts: vi.fn().mockResolvedValue({}),
  getPartiesWithAffairs: mocks.getPartiesWithAffairs,
  getPublicPartyMetadataBySlug: mocks.getPublicPartyMetadataBySlug,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import AffairesPage from "./page";

const render = (searchParams: Record<string, string>) =>
  (AffairesPage as (p: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

describe("/affaires : un slug de parti inconnu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAffairs.mockResolvedValue({ affairs: [], total: 0, totalPages: 0 });
    mocks.getPartiesWithAffairs.mockResolvedValue([]);
  });

  it("part en notFound au lieu de rendre une liste vide", async () => {
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue(null);

    await expect(render({ parti: "parti-qui-nexiste-pas" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("n'exécute pas les requêtes lourdes du listing pour un slug inconnu", async () => {
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue(null);

    await expect(render({ parti: "parti-qui-nexiste-pas" })).rejects.toThrow("NEXT_NOT_FOUND");
    // Tout l'intérêt côté coût : un slug arbitraire ne doit pas payer le listing.
    expect(mocks.getAffairs).not.toHaveBeenCalled();
  });

  it("laisse passer un parti public, même sans aucune affaire", async () => {
    mocks.getPublicPartyMetadataBySlug.mockResolvedValue({ name: "Parti public", shortName: "PP" });

    await render({ parti: "parti-public" });

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.getAffairs).toHaveBeenCalled();
  });

  it("ne consulte pas la base quand aucun filtre parti n'est présent", async () => {
    await render({});

    expect(mocks.getPublicPartyMetadataBySlug).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
