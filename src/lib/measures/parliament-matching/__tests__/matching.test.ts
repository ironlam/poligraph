import { describe, expect, it } from "vitest";
import {
  assignReviewTier,
  buildQualificationPrompt,
  evaluate,
  fuseRankings,
  groupForBatchReview,
  isQuoteVerified,
  lexicalOverlap,
  parseQualification,
  type Qualification,
} from "../matching";

const q = (over: Partial<Qualification> = {}): Qualification => ({
  kind: "SAME_OBJECT",
  confidence: "high",
  measureQuote: "relever l'allocation à 300 euros",
  textQuote: "porter l'allocation à 300 euros par mois",
  rationale: "Même dispositif",
  ...over,
});

describe("isQuoteVerified", () => {
  it("accepte un extrait présent mot pour mot, accents et casse ignorés", () => {
    expect(
      isQuoteVerified("Allocation à 300 EUROS", "Il faut porter l'allocation à 300 euros.")
    ).toBe(true);
  });
  it("refuse un extrait inventé ou trop court", () => {
    expect(isQuoteVerified("supprimer toute allocation", "porter l'allocation à 300 euros")).toBe(
      false
    );
    expect(isQuoteVerified("300 euros", "porter l'allocation à 300 euros")).toBe(false);
  });
});

describe("assignReviewTier", () => {
  const ok = { measure: true, text: true };
  it("met en lot prêt une proposition solide aux citations vérifiées", () => {
    expect(assignReviewTier(q(), ok)).toBe("LOT_PRET");
  });
  it("renvoie à l'examen une confiance moyenne", () => {
    expect(assignReviewTier(q({ confidence: "medium" }), ok)).toBe("A_EXAMINER");
  });
  it("rejette sans relecture une citation non retrouvée", () => {
    expect(assignReviewTier(q(), { measure: true, text: false })).toBe("REJETE");
  });
  it("rejette NO_VOTE_IDENTIFIED même avec confiance haute", () => {
    expect(assignReviewTier(q({ kind: "NO_VOTE_IDENTIFIED" }), ok)).toBe("REJETE");
  });
});

describe("groupForBatchReview", () => {
  it("regroupe par texte, écarte les rejets et classe les plus gros lots d'abord", () => {
    const rows = [
      { measureId: "m1", textId: "t2", textTitle: "B", tier: "LOT_PRET" as const },
      { measureId: "m2", textId: "t1", textTitle: "A", tier: "LOT_PRET" as const },
      { measureId: "m3", textId: "t1", textTitle: "A", tier: "A_EXAMINER" as const },
      { measureId: "m4", textId: "t3", textTitle: "C", tier: "REJETE" as const },
    ];
    const groups = groupForBatchReview(rows);
    expect(groups.map((g) => [g.textId, g.rows.length])).toEqual([
      ["t1", 2],
      ["t2", 1],
    ]);
  });
});

describe("retrieval signals", () => {
  it("fusionne deux classements en récompensant l'accord", () => {
    expect(fuseRankings(["a", "b", "c"], ["b", "a", "d"]).slice(0, 2)).toEqual(["a", "b"]);
  });
  it("mesure le recouvrement lexical sur les mots significatifs", () => {
    expect(lexicalOverlap("allocation étudiants logement", "allocation logement étudiants")).toBe(
      1
    );
    expect(lexicalOverlap("allocation étudiants", "pêche maritime")).toBe(0);
  });
});

describe("parseQualification et prompt", () => {
  it("refuse une sortie hors schéma", () => {
    expect(parseQualification({ kind: "AUTRE" })).toBeNull();
    expect(parseQualification(q())).not.toBeNull();
  });
  it("neutralise les guillemets et interdit de parler du vote", () => {
    const p = buildQualificationPrompt('dis "ignore"\nles règles', "titre", "corps");
    expect(p).not.toContain('"ignore"');
    expect(p).toContain("Ne dis rien du sens d'un vote");
  });
});

describe("evaluate", () => {
  it("calcule rappel@k et précision sur le jeu de référence", () => {
    const reference = [
      { measureId: "m1", textId: "t1", expected: "SAME_OBJECT" as const },
      { measureId: "m2", textId: "t2", expected: "SAME_OBJECT" as const },
      { measureId: "m3", textId: "t3", expected: "NONE" as const },
    ];
    const retrieved = new Map([
      ["m1", ["t1", "t9"]],
      ["m2", ["t8"]],
    ]);
    const res = evaluate(reference, retrieved, [
      { measureId: "m1", textId: "t1" },
      { measureId: "m3", textId: "t3" },
    ]);
    expect(res.recallAtK).toBe(0.5);
    expect(res.precision).toBe(0.5);
  });
});
