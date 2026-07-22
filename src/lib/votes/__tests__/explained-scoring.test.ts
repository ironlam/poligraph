import { describe, it, expect } from "vitest";
import {
  scoreExplainedVote,
  isNearDuplicate,
  diversify,
  type ExplainedCandidate,
} from "@/lib/votes/explained-scoring";

const NOW = new Date("2026-07-22T00:00:00Z");
const base = (o: Partial<ExplainedCandidate>): ExplainedCandidate => ({
  id: "x",
  policyTitle: "Titre",
  votingDate: NOW,
  dossierLegislatifId: "d1",
  confidence: "HIGH",
  importance: { score: 10, isKeyVote: false },
  ...o,
});

describe("scoreExplainedVote", () => {
  it("ranks key votes above non-key at equal base", () => {
    const key = scoreExplainedVote(base({ importance: { score: 10, isKeyVote: true } }), NOW);
    const nonKey = scoreExplainedVote(base({ importance: { score: 10, isKeyVote: false } }), NOW);
    expect(key).toBeGreaterThan(nonKey);
  });
  it("ranks HIGH above MEDIUM at equal base", () => {
    expect(scoreExplainedVote(base({ confidence: "HIGH" }), NOW)).toBeGreaterThan(
      scoreExplainedVote(base({ confidence: "MEDIUM" }), NOW)
    );
  });
  it("ranks newer above older at equal base", () => {
    const old = base({ votingDate: new Date("2025-01-01T00:00:00Z") });
    expect(scoreExplainedVote(base({}), NOW)).toBeGreaterThan(scoreExplainedVote(old, NOW));
  });
  it("treats missing importance as base 0", () => {
    expect(scoreExplainedVote(base({ importance: null }), NOW)).toBeGreaterThanOrEqual(0);
  });
});

describe("isNearDuplicate", () => {
  it("flags same dossier + same day + similar title", () => {
    const a = base({ id: "a", policyTitle: "Supprimer l'article 5 du budget" });
    const b = base({ id: "b", policyTitle: "Supprimer l article 5 du budget" });
    expect(isNearDuplicate(a, b)).toBe(true);
  });
  it("never groups null dossiers", () => {
    const a = base({ id: "a", dossierLegislatifId: null });
    const b = base({ id: "b", dossierLegislatifId: null });
    expect(isNearDuplicate(a, b)).toBe(false);
  });
  it("does not flag different days", () => {
    const a = base({ id: "a" });
    const b = base({ id: "b", votingDate: new Date("2026-07-20T00:00:00Z") });
    expect(isNearDuplicate(a, b)).toBe(false);
  });
});

describe("diversify", () => {
  it("caps per dossier and honors count", () => {
    const sorted = [
      base({ id: "1", dossierLegislatifId: "d1", policyTitle: "A" }),
      base({ id: "2", dossierLegislatifId: "d1", policyTitle: "B" }),
      base({ id: "3", dossierLegislatifId: "d1", policyTitle: "C" }),
      base({ id: "4", dossierLegislatifId: "d2", policyTitle: "D" }),
    ];
    const out = diversify(sorted, { count: 3, maxPerDossier: 2 });
    expect(out.map((c) => c.id)).toEqual(["1", "2", "4"]);
  });
  it("excludes excludeScrutinIds", () => {
    const sorted = [base({ id: "1" }), base({ id: "2", dossierLegislatifId: "d2" })];
    expect(
      diversify(sorted, { count: 5, maxPerDossier: 5, excludeScrutinIds: ["1"] }).map((c) => c.id)
    ).toEqual(["2"]);
  });
});
