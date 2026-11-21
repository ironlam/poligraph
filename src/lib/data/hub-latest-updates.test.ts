import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  measureFindFirst: vi.fn(),
  candidacyFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    measure: { findFirst: mocks.measureFindFirst },
    candidacy: { findMany: mocks.candidacyFindMany },
  },
}));

import { loadHubLatestUpdates } from "./hub";

type FindFirstArgs = { where: { candidacyId: { notIn: string[] } } };

/** One published measure per candidacy, served newest first like the real query. */
function serveMeasures(measures: { candidacyId: string; publishedAt: string }[]) {
  mocks.measureFindFirst.mockImplementation(async (args: FindFirstArgs) => {
    const next = measures.find((m) => !args.where.candidacyId.notIn.includes(m.candidacyId));
    if (next === undefined) return null;
    return {
      slug: `mesure-${next.candidacyId}`,
      candidacyId: next.candidacyId,
      theme: "LOGEMENT_URBANISME",
      publishedRevision: {
        text: "Texte",
        publishedAt: new Date(next.publishedAt),
        sources: [],
      },
      candidacy: { candidateName: next.candidacyId, politician: null },
    };
  });
}

function serveStatusChanges(changes: { candidacyId: string; changedAt: string }[]) {
  mocks.candidacyFindMany.mockResolvedValue(
    changes.map((c) => ({
      id: c.candidacyId,
      candidateName: c.candidacyId,
      status: "DECLARE",
      statusChangedAt: new Date(c.changedAt),
      sourceUrl: "https://example.org/annonce",
      sourceLabel: "Annonce",
      presidentialData: null,
      politician: { slug: c.candidacyId, photoUrl: null, blobPhotoUrl: null },
    }))
  );
}

const FIVE_MEASURES = [
  { candidacyId: "A", publishedAt: "2027-01-02T12:00:00Z" },
  { candidacyId: "B", publishedAt: "2027-01-02T11:00:00Z" },
  { candidacyId: "C", publishedAt: "2027-01-02T10:00:00Z" },
  { candidacyId: "D", publishedAt: "2027-01-02T09:00:00Z" },
  { candidacyId: "E", publishedAt: "2027-01-02T08:00:00Z" },
];

describe("loadHubLatestUpdates, limite du bloc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("laisse entrer la cinquième mesure quand un statut plus ancien remplace l'une des quatre premières", async () => {
    serveMeasures(FIVE_MEASURES);
    // Moins d'un jour avant la mesure de A : le statut prend sa place, daté de la veille.
    serveStatusChanges([{ candidacyId: "A", changedAt: "2027-01-01T13:00:00Z" }]);

    const latest = await loadHubLatestUpdates("election");

    expect(latest.map((u) => `${u.kind}:${u.candidacyId}`)).toEqual([
      "measure:B",
      "measure:C",
      "measure:D",
      "measure:E",
    ]);
  });

  it("s'arrête à quatre lectures quand aucun statut ne déplace de mesure", async () => {
    serveMeasures(FIVE_MEASURES);
    serveStatusChanges([]);

    const latest = await loadHubLatestUpdates("election");

    expect(latest.map((u) => u.candidacyId)).toEqual(["A", "B", "C", "D"]);
    expect(mocks.measureFindFirst).toHaveBeenCalledTimes(4);
  });

  it("rend ce qui existe quand il y a moins de quatre candidatures", async () => {
    serveMeasures(FIVE_MEASURES.slice(0, 2));
    serveStatusChanges([]);

    const latest = await loadHubLatestUpdates("election");

    expect(latest.map((u) => u.candidacyId)).toEqual(["A", "B"]);
  });
});
