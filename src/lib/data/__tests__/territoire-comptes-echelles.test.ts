import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { repereImport: { findMany: h.findMany } } }));

import { getEchellesComptesPubliees } from "@/lib/data/territoire-comptes";

const url = (jeu: string) => `https://data.ofgl.fr/explore/dataset/ofgl-base-${jeu}-consolidee/`;

beforeEach(() => vi.clearAllMocks());

describe("échelles dont les comptes sont publiés", () => {
  it("ne lit que les lots publiés des trois sources OFGL, en une requête bornée", async () => {
    h.findMany.mockResolvedValueOnce([{ source: { resourceUrl: url("regions") } }]);
    expect(await getEchellesComptesPubliees()).toEqual(["REG"]);
    const arg = h.findMany.mock.calls[0]?.[0];
    expect(arg.where.status).toBe("PUBLISHED");
    expect(arg.where.source.resourceUrl.in.sort()).toEqual(
      [url("communes"), url("departements"), url("regions")].sort()
    );
    expect(arg.take).toBe(50);
  });

  it("garde l'ordre commune, département, région", async () => {
    h.findMany.mockResolvedValueOnce([
      { source: { resourceUrl: url("regions") } },
      { source: { resourceUrl: url("communes") } },
      { source: { resourceUrl: url("departements") } },
    ]);
    expect(await getEchellesComptesPubliees()).toEqual(["COM", "DEP", "REG"]);
  });

  it("ne lie rien tant que la table n'existe pas", async () => {
    h.findMany.mockRejectedValueOnce({
      meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } },
    });
    expect(await getEchellesComptesPubliees()).toEqual([]);
  });
});
