import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db", () => ({ db: { politician: { findMany } } }));

import { GET } from "./route";

const context = { params: Promise.resolve({}) };

describe("GET recherche de personnalités", () => {
  it("ne met pas en cache une réponse de recherche nominative", async () => {
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/search/politicians?q=S%C3%A9gol%C3%A8ne%20Royal"),
      context
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
