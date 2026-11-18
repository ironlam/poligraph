import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { suggest } = vi.hoisted(() => ({ suggest: vi.fn() }));
vi.mock("@/lib/data/territoires", () => ({ suggestCommunesInDepartement: suggest }));

import { GET } from "./route";

const context = { params: Promise.resolve({}) };
const get = (query: string) =>
  GET(new NextRequest(`https://poligraph.fr/api/search/communes${query}`), context);

describe("GET suggestions de communes d'un département", () => {
  beforeEach(() => suggest.mockReset().mockResolvedValue([]));

  it("rend les communes avec leur adresse lisible, sans mise en cache", async () => {
    suggest.mockResolvedValue([
      { inseeCode: "29232", name: "Quimper", postalCodes: ["29000"], population: 63000 },
    ]);
    const response = await get("?departement=29&q=quim");

    expect(suggest).toHaveBeenCalledWith("29", "quim");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([
      {
        code: "29232",
        name: "Quimper",
        postalCodes: ["29000"],
        population: 63000,
        href: "/territoires/communes/quimper-29232",
      },
    ]);
  });

  it("passe des valeurs vides au lecteur quand un paramètre manque", async () => {
    const response = await get("");
    expect(suggest).toHaveBeenCalledWith("", "");
    expect(await response.json()).toEqual([]);
  });
});
