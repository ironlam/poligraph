import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Invariant : une valeur de `?sort=` que le produit ne propose plus doit se
 * comporter comme n'importe quelle valeur inconnue. Elle retombe sur le tri par
 * défaut, elle emprunte le chemin de listing normal, et elle n'atteint jamais
 * le `<select>` de tri, qui n'aurait pas d'option correspondante.
 *
 * `dissidence` est le cas concret qui a motivé ce test (tri retiré), mais
 * l'invariant vaut pour toute valeur retirée par la suite.
 */

const mocks = vi.hoisted(() => ({
  politicianFindMany: vi.fn(),
  politicianCount: vi.fn(),
  partyFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: mocks.politicianFindMany, count: mocks.politicianCount },
    party: { findMany: mocks.partyFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

import PolitiquesPage from "./page";

type Params = Record<string, string>;
const render = (searchParams: Params) =>
  (PolitiquesPage as (p: { searchParams: Promise<Params> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.politicianFindMany.mockResolvedValue([]);
  mocks.politicianCount.mockResolvedValue(0);
  mocks.partyFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([
    {
      with_conviction: BigInt(0),
      total_affairs: BigInt(0),
      deputes: BigInt(0),
      senateurs: BigInt(0),
      gouvernement: BigInt(0),
      dirigeants: BigInt(0),
      maires: BigInt(0),
    },
  ]);
});

describe("/politiques : le tri dissidence a été retiré", () => {
  it("rend un ?sort=dissidence périmé par le chemin normal", async () => {
    await expect(render({ sort: "dissidence" })).resolves.toBeDefined();

    // Le chemin normal compte les résultats ; la branche dédiée sortait avant.
    expect(mocks.politicianCount).toHaveBeenCalled();
    expect(mocks.politicianFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expect.anything(), take: expect.any(Number) })
    );
  });

  it("traite un ?sort= inconnu exactement pareil", async () => {
    await render({ sort: "nimportequoi" });
    expect(mocks.politicianCount).toHaveBeenCalled();
  });

  it("normalise vers le tri par défaut plutôt que de propager la valeur retirée", async () => {
    // Le tri par défaut ordonne par notoriété ; le repli muet de SORT_CONFIGS
    // ordonnait par nom. Distinguer les deux prouve que la normalisation a eu
    // lieu en amont, donc que le <select> et les liens de filtre reçoivent une
    // valeur qui existe.
    await render({ sort: "dissidence" });

    expect(mocks.politicianFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ prominenceScore: "desc" }, { lastName: "asc" }],
      })
    );
  });

  it("n'exécute aucune requête brute de classement", async () => {
    await render({ sort: "dissidence" });

    // getFilterCounts fait un $queryRaw ; aucun autre ne doit apparaître.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});
