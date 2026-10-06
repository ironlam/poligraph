import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: queryRaw } }));

import { GET } from "./route";

const context = { params: Promise.resolve({}) };

describe("GET recherche globale", () => {
  it("ne met pas en cache une réponse de recherche nominative", async () => {
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/search/global?q=Juan%20Branco"),
      context
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET recherche globale, affaires", () => {
  it("renvoie l'implication de chaque affaire pour que l'interface n'attribue pas le statut à un témoin", async () => {
    queryRaw.mockImplementation((first: unknown) => {
      const text = Array.isArray(first)
        ? first.join("")
        : ((first as { strings?: string[] }).strings ?? []).join("");
      if (!text.includes('FROM "Affair" a')) return Promise.resolve([]);
      return Promise.resolve([
        {
          slug: "affaire-temoin",
          title: "Affaire",
          status: "CONDAMNATION_DEFINITIVE",
          involvement: "INDIRECT",
          politicianName: "Témoin",
          politicianSlug: "temoin",
        },
      ]);
    });

    const response = await GET(
      new NextRequest("https://poligraph.fr/api/search/global?q=Affaire"),
      context
    );
    const body = (await response.json()) as { affairs: Array<{ involvement: string }> };

    expect(body.affairs.map((a) => a.involvement)).toEqual(["INDIRECT"]);
  });
});
