import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, getMock } = vi.hoisted(() => ({
  dbMock: {
    externalId: { findMany: vi.fn().mockResolvedValue([]) },
    politician: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "p1" }),
    },
    mandate: { create: vi.fn().mockResolvedValue({}) },
  },
  getMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/prisma-helpers", () => ({ upsertPoliticianExternalId: vi.fn() }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    get = getMock;
  },
}));

import { syncWikidataPoliticians } from "../wikidata-politicians";

const binding = (position: string) => ({
  person: { value: "http://www.wikidata.org/entity/Q42" },
  personLabel: { value: "Jean Dupont" },
  position: { value: `http://www.wikidata.org/entity/${position}` },
  startDate: { value: "2010-01-01T00:00:00Z" },
  endDate: { value: "2015-01-01T00:00:00Z" },
});

describe("gel de l'import wikidata-politicians", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Appels : sous-positions régionales, départementales, puis 3 requêtes SPARQL
    getMock
      .mockResolvedValueOnce({ data: { results: { bindings: [] } } })
      .mockResolvedValueOnce({ data: { results: { bindings: [] } } })
      .mockResolvedValueOnce({ data: { results: { bindings: [] } } })
      .mockResolvedValueOnce({ data: { results: { bindings: [] } } })
      .mockResolvedValueOnce({
        data: {
          results: {
            bindings: [binding("Q83307"), binding("Q1587677"), binding("Q3044918")],
          },
        },
      });
  });

  it("ne crée que les mandats non gouvernementaux", async () => {
    const stats = await syncWikidataPoliticians();
    const created = dbMock.mandate.create.mock.calls.map((c) => c[0].data.type);
    expect(created).toEqual(["DEPUTE"]);
    expect(stats.mandatesCreated).toBe(1);
    expect(stats.errors).toEqual([]);
  });
});
