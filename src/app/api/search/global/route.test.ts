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
