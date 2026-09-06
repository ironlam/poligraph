import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le tri « Plus indépendants » a été retiré (voir la PR de suppression).
 *
 * Deux raisons, l'éditoriale d'abord : `docs/design/patterns/VoteBreakdown.md`
 * pose que la position du groupe est « le seul contexte qui permet de lire une
 * dissidence », et que le vocabulaire de l'écart au groupe doit rester
 * « descriptif et borné ». Un classement décontextualisé des « plus
 * indépendants » fait exactement l'inverse. Techniquement, la requête qui
 * l'alimentait n'aboutissait jamais dans le statement timeout (POLIGRAPH-1E).
 *
 * Ce test garde les liens et signets périmés : `?sort=dissidence` doit rendre
 * la page par le chemin normal, sans branche dédiée.
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

  it("n'exécute aucune requête brute de classement", async () => {
    await render({ sort: "dissidence" });

    // getFilterCounts fait un $queryRaw ; aucun autre ne doit apparaître.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});
