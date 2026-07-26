import { describe, it, expect } from "vitest";
import { decideMergeAction, type MergeDecisionAffair } from "../merge-decision";
import { classifyMatchEvidence } from "@/lib/affairs/match-evidence";
import type { MatchConfidence } from "../matching";

/**
 * Issue #557 — sharing a decision is not being the same affair, whatever the
 * publication status.
 *
 * Two Carignon convictions share a pourvoi number, a facts date, a verdict date and
 * one cassation ruling, and are still two counts: subornation of a witness and misuse
 * of company assets. #537 drew that conclusion only at the published boundary; the
 * reasoning never depended on it.
 */

function draft(id: string, overrides: Partial<MergeDecisionAffair> = {}): MergeDecisionAffair {
  return {
    id,
    publicationStatus: "DRAFT",
    verifiedAt: null,
    sources: ["PRESSE"],
    ...overrides,
  };
}

function plan(matchedBy: string, confidence: MatchConfidence = "CERTAIN") {
  return decideMergeAction({
    affairA: draft("aaa"),
    affairB: draft("bbb"),
    confidence,
    matchedBy,
  });
}

describe("classifyMatchEvidence — la distinction est explicite (#557)", () => {
  it("classe les identités de décision officielles", () => {
    for (const signal of ["ecli", "pourvoiNumber", "caseNumbers"]) {
      expect(classifyMatchEvidence(signal)).toMatchObject({
        officialDecisionIdentity: true,
        editorialIdentityEvidence: false,
      });
    }
  });

  it("classe déjà une décision partagée, avant qu'elle ne devienne un signal", () => {
    // Déclaré à l'avance : le jour où le matcher produira ce signal, il sera classé
    // par construction, pas parce que quelqu'un aura pensé à l'ajouter.
    for (const signal of ["courtDecision", "judilibreId"]) {
      expect(classifyMatchEvidence(signal).officialDecisionIdentity).toBe(true);
    }
  });

  it("classe les preuves éditoriales", () => {
    for (const signal of ["title-exact", "title-partial", "title+category", "category+date"]) {
      expect(classifyMatchEvidence(signal)).toMatchObject({
        officialDecisionIdentity: false,
        editorialIdentityEvidence: true,
      });
    }
  });

  it("décompose un signal composite au lieu de le comparer en entier", () => {
    // Le piège que corrige #557 : un `Set.has()` sur la chaîne entière rendrait
    // false ici, et la paire repasserait en auto-fusion sur un ECLI.
    const evidence = classifyMatchEvidence("ecli+title-exact");

    expect(evidence.officialDecisionIdentity).toBe(true);
    expect(evidence.editorialIdentityEvidence).toBe(true);
  });

  it("ne compte un signal inconnu dans aucune catégorie", () => {
    const evidence = classifyMatchEvidence("signal-inedit");

    expect(evidence.officialDecisionIdentity).toBe(false);
    expect(evidence.editorialIdentityEvidence).toBe(false);
    expect(evidence.unrecognisedSignals).toEqual(["signal-inedit"]);
  });

  it("signale l'atome inconnu d'un composite sans perdre les autres", () => {
    const evidence = classifyMatchEvidence("ecli+quelque-chose");

    expect(evidence.officialDecisionIdentity).toBe(true);
    expect(evidence.editorialIdentityEvidence).toBe(false);
    expect(evidence.unrecognisedSignals).toEqual(["quelque-chose"]);
  });

  it("tolère les espaces et une chaîne vide", () => {
    expect(classifyMatchEvidence(" ecli + title-exact ").officialDecisionIdentity).toBe(true);
    expect(classifyMatchEvidence("")).toMatchObject({
      officialDecisionIdentity: false,
      editorialIdentityEvidence: false,
      unrecognisedSignals: [],
    });
  });
});

describe("Deux brouillons : identité de décision seule → revue (#557)", () => {
  it("refuse l'auto-fusion sur un ECLI commun, même en CERTAIN", () => {
    const result = plan("ecli", "CERTAIN");

    expect(result.decision).toBe("REVIEW_REQUIRED");
    expect(result.reason).toContain("plusieurs chefs");
    expect(result.keepId).toBeUndefined();
    expect(result.removeId).toBeUndefined();
  });

  it("refuse l'auto-fusion sur un pourvoi commun en HIGH", () => {
    expect(plan("pourvoiNumber", "HIGH").decision).toBe("REVIEW_REQUIRED");
  });

  it("refuse l'auto-fusion sur des caseNumbers communs en HIGH", () => {
    expect(plan("caseNumbers", "HIGH").decision).toBe("REVIEW_REQUIRED");
  });

  it("refuse l'auto-fusion sur une même CourtDecision liée", () => {
    expect(plan("courtDecision", "CERTAIN").decision).toBe("REVIEW_REQUIRED");
  });

  it("refuse l'auto-fusion sur un signal non reconnu", () => {
    const result = plan("signal-inedit", "CERTAIN");

    expect(result.decision).toBe("REVIEW_REQUIRED");
    expect(result.reason).toContain("sans preuve d'identité éditoriale");
  });

  it("nomme le signal dans la raison, pour que le relecteur sache quoi lire", () => {
    expect(plan("pourvoiNumber").reason).toContain("pourvoiNumber");
  });
});

describe("Deux brouillons : preuve éditoriale → auto-fusion préservée (#557)", () => {
  it("auto-fusionne sur un titre exact en HIGH", () => {
    const result = plan("title-exact", "HIGH");

    expect(result.decision).toBe("AUTO_MERGE_DRAFTS");
    expect(result.keepId).toBe("aaa");
    expect(result.removeId).toBe("bbb");
  });

  it("auto-fusionne sur titre + catégorie", () => {
    expect(plan("title+category", "HIGH").decision).toBe("AUTO_MERGE_DRAFTS");
  });

  it("auto-fusionne quand un identifiant judiciaire accompagne une preuve éditoriale", () => {
    // Autorisé parce que le moteur distingue désormais les deux catégories : c'est la
    // preuve éditoriale qui fonde la fusion, l'identifiant ne fait que s'y ajouter.
    expect(plan("ecli+title-exact", "CERTAIN").decision).toBe("AUTO_MERGE_DRAFTS");
  });

  it("laisse une preuve éditoriale faible partir en revue par la confiance", () => {
    expect(plan("title-partial", "POSSIBLE").decision).toBe("REVIEW_REQUIRED");
    expect(plan("category+date", "POSSIBLE").decision).toBe("REVIEW_REQUIRED");
  });
});

describe("La règle vaut pour toutes les combinaisons de statuts (#557)", () => {
  const cases: Array<[string, MergeDecisionAffair, MergeDecisionAffair]> = [
    ["brouillon + brouillon", draft("aaa"), draft("bbb")],
    [
      "brouillon + publiée",
      draft("aaa"),
      draft("bbb", { publicationStatus: "PUBLISHED", verifiedAt: new Date() }),
    ],
    [
      "publiée + publiée",
      draft("aaa", { publicationStatus: "PUBLISHED", verifiedAt: new Date() }),
      draft("bbb", { publicationStatus: "PUBLISHED", verifiedAt: new Date() }),
    ],
  ];

  for (const [label, affairA, affairB] of cases) {
    it(`${label} sur un ECLI commun → revue`, () => {
      const result = decideMergeAction({
        affairA,
        affairB,
        confidence: "CERTAIN",
        matchedBy: "ecli",
      });

      expect(result.decision).toBe("REVIEW_REQUIRED");
    });
  }
});

describe("Ce que #557 ne change pas (#557)", () => {
  it("une contradiction judiciaire reste prioritaire sur tout", () => {
    const result = decideMergeAction({
      affairA: draft("aaa"),
      affairB: draft("bbb"),
      confidence: "CERTAIN",
      matchedBy: "title-exact",
      contradictions: ["verdictDate"],
    });

    expect(result.reason).toContain("contradictoires");
  });

  it("un brouillon déjà relu par un humain n'est pas absorbé", () => {
    const result = decideMergeAction({
      affairA: draft("aaa"),
      affairB: draft("bbb", { verifiedAt: new Date() }),
      confidence: "HIGH",
      matchedBy: "title-exact",
    });

    expect(result.decision).toBe("REVIEW_REQUIRED");
  });

  it("un statut hors périmètre reste non éligible", () => {
    const result = decideMergeAction({
      affairA: draft("aaa", { publicationStatus: "ARCHIVED" }),
      affairB: draft("bbb"),
      confidence: "CERTAIN",
      matchedBy: "title-exact",
    });

    expect(result.decision).toBe("NOT_ELIGIBLE");
  });

  it("une affaire ne fusionne pas avec elle-même", () => {
    const result = decideMergeAction({
      affairA: draft("aaa"),
      affairB: draft("aaa"),
      confidence: "CERTAIN",
      matchedBy: "title-exact",
    });

    expect(result.decision).toBe("NOT_ELIGIBLE");
  });
});
