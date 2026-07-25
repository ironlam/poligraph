import { describe, it, expect, vi } from "vitest";

// matching.ts imports @/lib/db at module level; decideMergeAction is pure.
vi.mock("@/lib/db", () => ({ db: {} }));

import { decideMergeAction, type MergeDecisionAffair } from "../merge-decision";
import type { PublicationStatus, SourceType } from "@/generated/prisma";

function side(overrides: Partial<MergeDecisionAffair> & { id: string }): MergeDecisionAffair {
  return {
    publicationStatus: "DRAFT" as PublicationStatus,
    verifiedAt: null,
    sources: [],
    ...overrides,
  };
}

const press = ["PRESSE"] as SourceType[];

describe("decideMergeAction — deux brouillons (#525)", () => {
  it("auto-fusionne sur une confiance suffisante", () => {
    const plan = decideMergeAction({
      affairA: side({ id: "a", sources: press }),
      affairB: side({ id: "b" }),
      confidence: "HIGH",
      matchedBy: "title+category",
    });

    expect(plan.decision).toBe("AUTO_MERGE_DRAFTS");
    // Le plus riche en sources survit.
    expect(plan.keepId).toBe("a");
    expect(plan.removeId).toBe("b");
  });

  it("exige une revue sur un rapprochement POSSIBLE", () => {
    const plan = decideMergeAction({
      affairA: side({ id: "a" }),
      affairB: side({ id: "b" }),
      confidence: "POSSIBLE",
      matchedBy: "politician+category+window",
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
  });

  it("ne supprime jamais automatiquement un brouillon validé humainement", () => {
    // « b » serait absorbé sur le critère des sources, mais il a été relu.
    const plan = decideMergeAction({
      affairA: side({ id: "a", sources: press }),
      affairB: side({ id: "b", verifiedAt: new Date("2026-01-01") }),
      confidence: "CERTAIN",
      matchedBy: "ecli",
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
    expect(plan.removeId).toBeUndefined();
  });
});

describe("decideMergeAction — brouillon face à une affaire publiée (#525)", () => {
  const published = side({ id: "pub", publicationStatus: "PUBLISHED" as PublicationStatus });
  const draft = side({ id: "draft" });

  it("absorbe toujours le brouillon dans l'affaire publiée sur identifiant judiciaire", () => {
    for (const matchedBy of ["ecli", "pourvoiNumber", "caseNumbers"]) {
      const plan = decideMergeAction({
        affairA: published,
        affairB: draft,
        confidence: "HIGH",
        matchedBy,
      });

      expect(plan.decision).toBe("AUTO_ABSORB_DRAFT_INTO_PUBLISHED");
      expect(plan.keepId).toBe("pub");
      expect(plan.removeId).toBe("draft");
    }
  });

  it("garde l'affaire publiée même quand le brouillon a plus de sources", () => {
    // Le sens de la fusion ne dépend jamais du nombre de sources ici.
    const plan = decideMergeAction({
      affairA: side({ id: "pub", publicationStatus: "PUBLISHED" as PublicationStatus }),
      affairB: side({ id: "draft", sources: ["PRESSE", "OFFICIEL"] as SourceType[] }),
      confidence: "CERTAIN",
      matchedBy: "ecli",
    });

    expect(plan.keepId).toBe("pub");
    expect(plan.removeId).toBe("draft");
  });

  it("exige une revue quand seul le titre rapproche", () => {
    const plan = decideMergeAction({
      affairA: published,
      affairB: draft,
      confidence: "HIGH",
      matchedBy: "title+category",
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
    expect(plan.reason).toContain("heuristique");
  });

  it("exige une revue quand le brouillon affirme autre chose sur un champ non transférable", () => {
    const plan = decideMergeAction({
      affairA: published,
      affairB: draft,
      confidence: "CERTAIN",
      matchedBy: "ecli",
      unpropagatableDifferences: ["involvement"],
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
    expect(plan.reason).toContain("involvement");
  });

  it("ne supprime jamais automatiquement un brouillon validé humainement", () => {
    const plan = decideMergeAction({
      affairA: published,
      affairB: side({ id: "draft", verifiedAt: new Date("2026-01-01") }),
      confidence: "CERTAIN",
      matchedBy: "ecli",
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
  });
});

describe("decideMergeAction — deux affaires publiées (#525)", () => {
  it("n'auto-fusionne jamais, même en CERTAIN sur identifiant judiciaire", () => {
    const plan = decideMergeAction({
      affairA: side({ id: "a", publicationStatus: "PUBLISHED" as PublicationStatus }),
      affairB: side({ id: "b", publicationStatus: "PUBLISHED" as PublicationStatus }),
      confidence: "CERTAIN",
      matchedBy: "ecli",
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
    expect(plan.keepId).toBeUndefined();
  });

  it("une affaire publiée vérifiée n'est jamais supprimée automatiquement", () => {
    const plan = decideMergeAction({
      affairA: side({
        id: "a",
        publicationStatus: "PUBLISHED" as PublicationStatus,
        verifiedAt: new Date("2026-01-01"),
      }),
      affairB: side({
        id: "b",
        publicationStatus: "PUBLISHED" as PublicationStatus,
        verifiedAt: new Date("2026-01-02"),
      }),
      confidence: "CERTAIN",
      matchedBy: "pourvoiNumber",
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
  });
});

describe("decideMergeAction — garde-fous (#525)", () => {
  it("toute contradiction judiciaire passe en revue, quelle que soit la confiance", () => {
    const plan = decideMergeAction({
      affairA: side({ id: "a" }),
      affairB: side({ id: "b" }),
      confidence: "CERTAIN",
      matchedBy: "ecli",
      contradictions: ["verdictDate"],
    });

    expect(plan.decision).toBe("REVIEW_REQUIRED");
    expect(plan.reason).toContain("verdictDate");
  });

  it("refuse une affaire hors du périmètre de statuts", () => {
    for (const status of ["REJECTED", "EXCLUDED", "ARCHIVED"] as PublicationStatus[]) {
      const plan = decideMergeAction({
        affairA: side({ id: "a", publicationStatus: status }),
        affairB: side({ id: "b" }),
        confidence: "CERTAIN",
        matchedBy: "ecli",
      });

      expect(plan.decision).toBe("NOT_ELIGIBLE");
    }
  });

  it("refuse une affaire face à elle-même", () => {
    const plan = decideMergeAction({
      affairA: side({ id: "a" }),
      affairB: side({ id: "a" }),
      confidence: "CERTAIN",
      matchedBy: "ecli",
    });

    expect(plan.decision).toBe("NOT_ELIGIBLE");
  });

  it("est déterministe : l'ordre des deux côtés ne change pas le plan", () => {
    // À sources égales, le départage se fait sur l'id, pas sur la place dans la paire.
    const a = side({ id: "zzz" });
    const b = side({ id: "aaa" });

    const forward = decideMergeAction({
      affairA: a,
      affairB: b,
      confidence: "HIGH",
      matchedBy: "title+category",
    });
    const backward = decideMergeAction({
      affairA: b,
      affairB: a,
      confidence: "HIGH",
      matchedBy: "title+category",
    });

    expect(forward).toEqual(backward);
    expect(forward.keepId).toBe("aaa");
  });

  it("reste déterministe quand les sources départagent", () => {
    const rich = side({ id: "zzz", sources: ["PRESSE", "OFFICIEL"] as SourceType[] });
    const poor = side({ id: "aaa", sources: press });

    const forward = decideMergeAction({
      affairA: rich,
      affairB: poor,
      confidence: "HIGH",
      matchedBy: "title+category",
    });
    const backward = decideMergeAction({
      affairA: poor,
      affairB: rich,
      confidence: "HIGH",
      matchedBy: "title+category",
    });

    expect(forward).toEqual(backward);
    expect(forward.keepId).toBe("zzz");
  });
});
