import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #525 — a ruling must survive re-runs, and must stop surviving once the
// rows it was made against have changed.

const h = vi.hoisted(() => ({
  decisionFindMany: vi.fn(),
  decisionUpsert: vi.fn(),
  decisionGroupBy: vi.fn(),
  dismissedFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    affairPairDecision: {
      findMany: h.decisionFindMany,
      upsert: h.decisionUpsert,
      groupBy: h.decisionGroupBy,
    },
    dismissedDuplicate: { findMany: h.dismissedFindMany },
  },
}));

import {
  buildPairDecisionUpsert,
  computePairPrecision,
  loadPairExclusions,
} from "../pair-decision";
import { canonicalPair } from "../affair-pair";

const signal = { confidence: "HIGH", matchedBy: "pourvoiNumber", score: 0.95 };

beforeEach(() => {
  vi.clearAllMocks();
  h.dismissedFindMany.mockResolvedValue([]);
  h.decisionFindMany.mockResolvedValue([]);
  h.decisionGroupBy.mockResolvedValue([]);
});

describe("canonicalPair — une seule identité par paire (#525)", () => {
  it("donne la même clé dans les deux sens", () => {
    expect(canonicalPair("b", "a").key).toBe(canonicalPair("a", "b").key);
    expect(canonicalPair("b", "a").a).toBe("a");
  });
});

describe("buildPairDecisionUpsert — ordre canonique (#525)", () => {
  it("trie les identifiants", () => {
    const args = buildPairDecisionUpsert({
      affairIdA: "zzz",
      affairIdB: "aaa",
      classification: "DISTINCT",
      reviewedBy: "admin",
      signal,
      affairAUpdatedAt: new Date("2026-07-01"),
      affairBUpdatedAt: new Date("2026-07-02"),
    });

    expect(args.where).toEqual({ pairKey: "aaa:zzz" });
    expect(args.create).toMatchObject({ affairIdA: "aaa", affairIdB: "zzz" });
  });

  it("fait suivre les dates au tri, sinon la fraîcheur est comparée à la mauvaise fiche", () => {
    const args = buildPairDecisionUpsert({
      affairIdA: "zzz",
      affairIdB: "aaa",
      classification: "DISTINCT",
      reviewedBy: "admin",
      signal,
      affairAUpdatedAt: new Date("2026-07-01"),
      affairBUpdatedAt: new Date("2026-07-02"),
    });

    // "aaa" est passée en second à l'appel : sa date doit devenir affairAUpdatedAt.
    expect(args.create).toMatchObject({
      affairAUpdatedAt: new Date("2026-07-02"),
      affairBUpdatedAt: new Date("2026-07-01"),
    });
  });

  it("conserve le survivant d'une fusion", () => {
    const args = buildPairDecisionUpsert({
      affairIdA: "a",
      affairIdB: "b",
      classification: "DUPLICATE",
      reviewedBy: "admin",
      signal,
      affairAUpdatedAt: new Date("2026-07-01"),
      affairBUpdatedAt: new Date("2026-07-01"),
      mergedIntoAffairId: "a",
    });

    expect(args.create).toMatchObject({ mergedIntoAffairId: "a" });
  });
});

describe("loadPairExclusions — ce qui exclut, ce qui revient (#525)", () => {
  const now = new Date("2026-07-01T00:00:00Z");
  const later = new Date("2026-07-20T00:00:00Z");

  function ruling(classification: string, updated = now) {
    return {
      pairKey: "a:b",
      affairIdA: "a",
      affairIdB: "b",
      classification,
      affairAUpdatedAt: updated,
      affairBUpdatedAt: updated,
    };
  }

  it("exclut DUPLICATE, LINKED et DISTINCT", async () => {
    for (const classification of ["DUPLICATE", "LINKED", "DISTINCT"]) {
      h.decisionFindMany.mockResolvedValue([ruling(classification)]);

      const result = await loadPairExclusions(
        new Map([
          ["a", now],
          ["b", now],
        ])
      );

      expect(result.excluded.has("a:b")).toBe(true);
    }
  });

  it("n'exclut pas UNCERTAIN, qui diffère au lieu de trancher", async () => {
    h.decisionFindMany.mockResolvedValue([ruling("UNCERTAIN")]);

    const result = await loadPairExclusions(
      new Map([
        ["a", now],
        ["b", now],
      ])
    );

    expect(result.excluded.has("a:b")).toBe(false);
    expect(result.uncertain.has("a:b")).toBe(true);
  });

  it("rouvre un DISTINCT quand une des deux fiches a été modifiée depuis", async () => {
    h.decisionFindMany.mockResolvedValue([ruling("DISTINCT")]);

    const result = await loadPairExclusions(
      new Map([
        ["a", later],
        ["b", now],
      ])
    );

    expect(result.stale.has("a:b")).toBe(true);
    expect(result.excluded.has("a:b")).toBe(false);
  });

  it("ne rouvre pas un DUPLICATE : la fusion a déjà eu lieu", async () => {
    h.decisionFindMany.mockResolvedValue([ruling("DUPLICATE")]);

    const result = await loadPairExclusions(
      new Map([
        ["a", later],
        ["b", later],
      ])
    );

    expect(result.stale.has("a:b")).toBe(false);
    expect(result.excluded.has("a:b")).toBe(true);
  });

  it("honore encore l'ancienne table de faux positifs, dans les deux sens", async () => {
    h.dismissedFindMany.mockResolvedValue([{ affairIdA: "b", affairIdB: "a" }]);

    const result = await loadPairExclusions(new Map());

    expect(result.excluded.has("a:b")).toBe(true);
  });

  it("expose la classification pour que la file affiche ce qui a été jugé", async () => {
    h.decisionFindMany.mockResolvedValue([ruling("UNCERTAIN")]);

    const result = await loadPairExclusions(new Map());

    expect(result.classifications.get("a:b")).toBe("UNCERTAIN");
  });
});

describe("computePairPrecision — mesure sur tous les jugements (#525)", () => {
  it("ne rend rien avant le premier jugement", async () => {
    const metrics = await computePairPrecision(12);

    expect(metrics.precision).toBeNull();
    expect(metrics.candidatePairs).toBe(12);
  });

  it("rapporte les doublons aux paires réellement tranchées", async () => {
    h.decisionGroupBy.mockResolvedValue([
      { classification: "DUPLICATE", _count: { _all: 3 } },
      { classification: "DISTINCT", _count: { _all: 1 } },
      { classification: "LINKED", _count: { _all: 0 } },
    ]);

    const metrics = await computePairPrecision(10);

    expect(metrics.precision).toBe(0.75);
    expect(metrics.byClassification.DUPLICATE).toBe(3);
  });

  it("laisse UNCERTAIN hors du calcul, des deux côtés", async () => {
    h.decisionGroupBy.mockResolvedValue([
      { classification: "DUPLICATE", _count: { _all: 1 } },
      { classification: "DISTINCT", _count: { _all: 1 } },
      { classification: "UNCERTAIN", _count: { _all: 8 } },
    ]);

    const metrics = await computePairPrecision(10);

    // 1 / 2, pas 1 / 10 : différer n'est pas juger.
    expect(metrics.precision).toBe(0.5);
    expect(metrics.ruled).toBe(10);
  });
});
