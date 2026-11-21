import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryAuthor: vi.fn(),
  queryCandidacy: vi.fn(),
  mentionFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { factCheckMention: { findMany: mocks.mentionFindMany } } }));
vi.mock("../factcheck-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../factcheck-context")>()),
  queryAuthor: mocks.queryAuthor,
  queryCandidacy: mocks.queryCandidacy,
}));

import {
  groupByYear,
  queryPoliticianFactCheckLanding,
  summarizeBySource,
  verdictGroupOf,
} from "../factcheck-politician";

function mention(
  slug: string,
  isClaimant: boolean,
  verdictRating: string,
  source: string,
  day: string
) {
  return {
    isClaimant,
    factCheck: {
      slug,
      title: `Titre ${slug}`,
      claimText: `Déclaration ${slug}`,
      verdictRating,
      source,
      publishedAt: new Date(`${day}T10:00:00.000Z`),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryAuthor.mockResolvedValue({
    id: "pol-1",
    identity: { slug: "gabriel-attal", fullName: "Gabriel Attal" },
  });
  mocks.queryCandidacy.mockResolvedValue(null);
  mocks.mentionFindMany.mockResolvedValue([
    mention("fc-1", true, "UNVERIFIABLE", "AFP Factuel", "2026-04-09"),
    mention("fc-2", true, "MOSTLY_FALSE", "TF1 Info", "2024-07-03"),
    mention("fc-3", false, "FALSE", "Franceinfo", "2024-05-01"),
    mention("fc-4", true, "MOSTLY_TRUE", "TF1 Info", "2023-02-02"),
  ]);
});

describe("verdictGroupOf", () => {
  it("range chaque verdict dans son groupe", () => {
    expect(verdictGroupOf("MOSTLY_TRUE")).toBe("vrai");
    expect(verdictGroupOf("OUT_OF_CONTEXT")).toBe("trompeur");
    expect(verdictGroupOf("FALSE")).toBe("faux");
    expect(verdictGroupOf("UNVERIFIABLE")).toBe("inverifiable");
  });
});

describe("summarizeBySource", () => {
  it("compte chaque rédaction par verdict, la plus fournie en premier", () => {
    const rows = summarizeBySource([
      { source: "Franceinfo", verdictRating: "TRUE" },
      { source: "TF1 Info", verdictRating: "FALSE" },
      { source: "TF1 Info", verdictRating: "MOSTLY_FALSE" },
      { source: "AFP Factuel", verdictRating: "MISLEADING" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["TF1 Info", "AFP Factuel", "Franceinfo"]);
    expect(rows[0]).toEqual({
      name: "TF1 Info",
      total: 2,
      vrai: 0,
      trompeur: 0,
      faux: 2,
      inverifiable: 0,
    });
  });
});

describe("groupByYear", () => {
  it("regroupe par année UTC, la plus récente en premier", () => {
    const groups = groupByYear([
      { id: "a", publishedAt: new Date("2024-12-31T23:30:00.000Z") },
      { id: "b", publishedAt: new Date("2025-01-01T00:30:00.000Z") },
      { id: "c", publishedAt: new Date("2024-03-01T00:00:00.000Z") },
    ]);
    expect(groups.map((g) => [g.year, g.items.map((i) => i.id)])).toEqual([
      [2025, ["b"]],
      [2024, ["a", "c"]],
    ]);
  });
});

describe("queryPoliticianFactCheckLanding", () => {
  it("sépare les déclarations de la personne des fact-checks qui la citent", async () => {
    const landing = await queryPoliticianFactCheckLanding("gabriel-attal");
    expect(landing?.claimed.map((f) => f.slug)).toEqual(["fc-1", "fc-2", "fc-4"]);
    expect(landing?.cited.map((f) => f.slug)).toEqual(["fc-3"]);
    expect(landing?.breakdown).toEqual({ vrai: 1, trompeur: 0, faux: 1, inverifiable: 1 });
    expect(landing?.bySource.map((s) => s.name)).toEqual(["TF1 Info", "AFP Factuel"]);
    expect(landing?.firstYear).toBe(2023);
    expect(landing?.hasCandidacy).toBe(false);
  });

  it("est indexable à partir de trois déclarations attribuées", async () => {
    expect((await queryPoliticianFactCheckLanding("gabriel-attal"))?.indexable).toBe(true);
    mocks.mentionFindMany.mockResolvedValue([
      mention("fc-1", true, "FALSE", "TF1 Info", "2026-04-09"),
      mention("fc-2", true, "TRUE", "TF1 Info", "2025-04-09"),
      mention("fc-3", false, "FALSE", "TF1 Info", "2024-04-09"),
      mention("fc-4", false, "FALSE", "TF1 Info", "2023-04-09"),
    ]);
    // Being cited does not count toward the threshold.
    expect((await queryPoliticianFactCheckLanding("gabriel-attal"))?.indexable).toBe(false);
  });

  it("garde une page pour une personne seulement citée, sans bilan", async () => {
    mocks.mentionFindMany.mockResolvedValue([
      mention("fc-3", false, "FALSE", "Franceinfo", "2024-05-01"),
    ]);
    const landing = await queryPoliticianFactCheckLanding("gabriel-attal");
    expect(landing?.claimed).toEqual([]);
    expect(landing?.firstYear).toBeNull();
    expect(landing?.indexable).toBe(false);
  });

  it("n'a pas de page pour une personne inconnue ou non publiée", async () => {
    mocks.queryAuthor.mockResolvedValue(null);
    expect(await queryPoliticianFactCheckLanding("inconnu")).toBeNull();
    expect(mocks.mentionFindMany).not.toHaveBeenCalled();
  });

  it("n'a pas de page sans aucun fact-check public", async () => {
    mocks.mentionFindMany.mockResolvedValue([]);
    expect(await queryPoliticianFactCheckLanding("gabriel-attal")).toBeNull();
  });

  it("signale une candidature sourcée", async () => {
    mocks.queryCandidacy.mockResolvedValue({ status: "DECLARE" });
    expect((await queryPoliticianFactCheckLanding("gabriel-attal"))?.hasCandidacy).toBe(true);
  });
});
