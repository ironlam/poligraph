import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicElectionDetails: vi.fn(),
}));

vi.mock("@/lib/data/election-details", () => ({
  ELECTION_CANDIDACIES_DEFAULT_LIMIT: 20,
  ELECTION_CANDIDACIES_MAX_LIMIT: 100,
  getPublicElectionDetails: mocks.getPublicElectionDetails,
}));
vi.mock("@/lib/cache", () => ({
  withCache: (response: Response) => response,
}));
vi.mock("@/lib/api/with-public-route", () => ({
  withPublicRoute: <T extends (...args: never[]) => unknown>(handler: T) => handler,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ slug: "municipales-2020" }) };

describe("GET /api/elections/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicElectionDetails.mockResolvedValue({
      id: "election-1",
      candidacies: {
        data: [{ id: "candidacy-1" }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
      rounds: [],
    });
  });

  it("demande la page par défaut au lecteur de données", async () => {
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/elections/municipales-2020"),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.getPublicElectionDetails).toHaveBeenCalledWith("municipales-2020", {
      page: 1,
      limit: 20,
      skip: 0,
    });
    expect((await response.json()).candidacies.pagination).toBeDefined();
  });

  it.each([
    "page=0",
    "page=1.5",
    "page=abc",
    "page=9007199254740992",
    "limit=0",
    "limit=101",
    "limit=999999",
    "limit=1.0",
  ])("refuse un paramètre de pagination invalide: %s", async (query) => {
    const response = await GET(
      new NextRequest(`https://poligraph.fr/api/elections/municipales-2020?${query}`),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Pagination invalide" });
    expect(mocks.getPublicElectionDetails).not.toHaveBeenCalled();
  });

  it("retourne 404 sans lire les candidatures d'une élection absente", async () => {
    mocks.getPublicElectionDetails.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("https://poligraph.fr/api/elections/inconnue?limit=100"),
      { params: Promise.resolve({ slug: "inconnue" }) }
    );

    expect(response.status).toBe(404);
  });
});
