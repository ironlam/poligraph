import { describe, expect, it } from "vitest";
import {
  assignReviewTier,
  embeddingCacheKey,
  buildQualificationPrompt,
  buildReferenceSheet,
  isGenericEvidence,
  sharedDistinctiveTerms,
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
  it("vérifie chaque fragment d'une citation reliée par une ellipse", () => {
    const source =
      "Il faut porter l'allocation à 300 euros. Elle sera versée chaque mois aux étudiants.";
    expect(
      isQuoteVerified(
        "porter l'allocation à 300 euros [...] versée chaque mois aux étudiants",
        source
      )
    ).toBe(true);
    expect(
      isQuoteVerified(
        "porter l'allocation à 300 euros ... supprimée pour tous les étudiants",
        source
      )
    ).toBe(false);
  });
  it("refuse un extrait inventé ou trop court", () => {
    expect(isQuoteVerified("supprimer toute allocation", "porter l'allocation à 300 euros")).toBe(
      false
    );
    expect(isQuoteVerified("300 euros", "porter l'allocation à 300 euros")).toBe(false);
  });
});

describe("isGenericEvidence", () => {
  const measure =
    "Relever l'allocation logement des étudiants à 300 euros par mois sous conditions de ressources";
  it("repère le titre du dossier recopié", () => {
    expect(
      isGenericEvidence(
        q({ textQuote: "Projet de loi logement" }),
        "Projet de loi logement étudiant"
      )
    ).toBe(true);
  });
  it("ne juge pas générique une mesure courte citée en entier", () => {
    expect(isGenericEvidence(q({ measureQuote: measure }), "Autre titre")).toBe(false);
  });
  it("laisse passer des extraits précis", () => {
    expect(isGenericEvidence(q(), "Projet de loi logement étudiant")).toBe(false);
  });
});

describe("sharedDistinctiveTerms", () => {
  it("compte les mots distinctifs communs", () => {
    expect(
      sharedDistinctiveTerms("élevage d'animaux intensif", "protection des animaux d'élevage")
    ).toBe(2);
    expect(sharedDistinctiveTerms("élevage d'animaux intensif", "pêche des poulpes")).toBe(0);
  });
});

describe("assignReviewTier", () => {
  const ok = { measure: true, text: true, specific: true, vocabulary: true };
  it("met en lot prêt une proposition solide aux citations vérifiées", () => {
    expect(assignReviewTier(q(), ok)).toBe("LOT_PRET");
  });
  it("ne coche jamais d'office un BROADER_TEXT", () => {
    expect(assignReviewTier(q({ kind: "BROADER_TEXT" }), ok)).toBe("A_EXAMINER");
  });
  it("rejette un rapprochement sans vocabulaire commun", () => {
    expect(assignReviewTier(q(), { ...ok, vocabulary: false })).toBe("REJETE");
  });
  it("renvoie à l'examen, sans rejeter, une citation qui n'est que le titre du dossier", () => {
    expect(assignReviewTier(q(), { ...ok, specific: false })).toBe("A_EXAMINER");
  });
  it("renvoie à l'examen une confiance moyenne", () => {
    expect(assignReviewTier(q({ confidence: "medium" }), ok)).toBe("A_EXAMINER");
  });
  it("rejette sans relecture une citation non retrouvée", () => {
    expect(assignReviewTier(q(), { ...ok, text: false })).toBe("REJETE");
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
  it("ne compte pas une proposition non jugée comme un faux positif", () => {
    const res = evaluate(
      [{ measureId: "m1", textId: "t1", expected: "SAME_OBJECT" as const }],
      new Map([["m1", ["t1"]]]),
      [
        { measureId: "m1", textId: "t1" },
        { measureId: "m7", textId: "t7" },
      ]
    );
    expect(res.precision).toBe(1);
    expect(res.judgedProposed).toBe(1);
    expect(res.proposed).toBe(2);
  });
  it("refuse une feuille dont un verdict est vide", () => {
    expect(() =>
      evaluate([{ measureId: "m1", textId: "t1", expected: "" as never }], new Map(), [
        { measureId: "m1", textId: "t1" },
      ])
    ).toThrow(/sans verdict/);
  });
});

describe("buildReferenceSheet", () => {
  const rec = (
    id: string,
    kind: Qualification["kind"],
    tier: "LOT_PRET" | "A_EXAMINER" | "REJETE",
    rank = 0
  ) => ({
    measureId: id,
    textId: `t-${id}`,
    measureText: "m",
    textTitle: "t",
    tier,
    rank,
    q: q({ kind }),
  });
  it("garde tous les SAME_OBJECT, les BROADER proposés et les négatifs bien classés", () => {
    const sheet = buildReferenceSheet(
      [
        rec("a", "SAME_OBJECT", "REJETE"),
        rec("b", "BROADER_TEXT", "A_EXAMINER"),
        rec("c", "BROADER_TEXT", "REJETE"),
        rec("d", "NO_VOTE_IDENTIFIED", "REJETE", 0),
        rec("e", "NO_VOTE_IDENTIFIED", "REJETE", 4),
      ],
      { same: 9, broader: 10, negatives: 11 }
    );
    expect(sheet.map((s) => s.measureId)).toEqual(["a", "b", "d"]);
    expect(sheet.every((s) => s.expected === "")).toBe(true);
  });
});

describe("embeddingCacheKey", () => {
  it("reste stable pour un même texte", () => {
    expect(embeddingCacheKey("m", "id1", "Plafonner les frais")).toBe(
      embeddingCacheKey("m", "id1", "Plafonner les frais")
    );
  });
  it("change quand le texte de la mesure est réécrit", () => {
    expect(embeddingCacheKey("m", "id1", "Plafonner les frais")).not.toBe(
      embeddingCacheKey("m", "id1", "Encadrer les frais")
    );
  });
  it("distingue une mesure d'un dossier de même identifiant", () => {
    expect(embeddingCacheKey("m", "id1", "texte")).not.toBe(embeddingCacheKey("d", "id1", "texte"));
  });
});
