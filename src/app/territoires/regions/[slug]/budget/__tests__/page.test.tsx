import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getComptesTerritoire: vi.fn() }));

vi.mock("@/lib/data/territoire-comptes", () => ({
  getEchellesComptesPubliees: vi.fn(async () => []),
  getComptesTerritoire: h.getComptesTerritoire,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import RegionBudgetPage, { generateMetadata } from "../page";

const EMPTY = { dernierExercice: null, agregats: [], source: null };
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => vi.clearAllMocks());

describe("/territoires/regions/[slug]/budget", () => {
  it("n'existe pas tant qu'aucun compte n'est publié", async () => {
    h.getComptesTerritoire.mockResolvedValue(EMPTY);
    await expect(RegionBudgetPage(params("bretagne"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.getComptesTerritoire).toHaveBeenCalledWith("REG", "53");
  });

  it("répond 404 pour une région inconnue sans lire la base", async () => {
    await expect(RegionBudgetPage(params("atlantide"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.getComptesTerritoire).not.toHaveBeenCalled();
  });

  it("s'indexe pour une région qui a ses propres comptes, avec son adresse canonique", async () => {
    h.getComptesTerritoire.mockResolvedValue({ ...EMPTY, dernierExercice: 2024 });
    const meta = await generateMetadata(params("bretagne"));
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("/territoires/regions/bretagne/budget");
    expect(meta.title).toBe("Bretagne : comptes de la région");
  });

  it("revient vers la page de la région", async () => {
    h.getComptesTerritoire.mockResolvedValue({ ...EMPTY, dernierExercice: 2024 });
    const html = renderToStaticMarkup(await RegionBudgetPage(params("bretagne")));
    expect(html).toContain('href="/territoires/regions/bretagne"');
    expect(html).toContain("Les comptes de la région : Bretagne");
  });

  it("reste hors de l'index pour Mayotte, dont la page renvoie au département", async () => {
    h.getComptesTerritoire.mockResolvedValue({ ...EMPTY, dernierExercice: 2024 });
    const meta = await generateMetadata(params("mayotte"));
    // The page exists (not the « introuvable » verdict): it is withheld by the predicate.
    expect(meta.title).toBe("Mayotte : comptes de la région");
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
