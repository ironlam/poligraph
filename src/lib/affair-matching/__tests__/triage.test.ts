import { describe, it, expect } from "vitest";
import { classifyForTriage, TRIAGE_VERSION, type TriageRow } from "../triage";
import { RESOLVER_VERSION } from "../signals/constants";
import type { SurnameVocabulary } from "../surname-ambiguity";
import { HUMAN_REVIEWERS } from "@/lib/affairs/review-provenance";

/** Flags exactly the surnames it is given, so the tests exercise triage, not the rules. */
const vocabularyFlagging = (...surnames: string[]): SurnameVocabulary => ({
  lookup: (s) => (surnames.includes(s) ? { kind: "COMMON_WORD", detail: "mesuré" } : null),
});

const surnames: Record<string, string> = {
  "pol-paris": "Paris",
  "pol-justice": "Justice",
  "pol-melenchon": "Mélenchon",
};
const surnameOf = (id: string) => surnames[id] ?? null;

function candidate(id: string, matchType: string | null, score = 1) {
  return {
    candidateId: id,
    totalScore: score,
    signals: [
      {
        signalId: "name-quality",
        logLikelihoodRatio: score,
        evidence: matchType ? { matchType } : null,
      },
    ],
  };
}

function row(overrides: Partial<TriageRow> = {}): TriageRow {
  return {
    id: "dec-1",
    judgment: "NO_MATCH",
    affairId: null,
    resolverVersion: RESOLVER_VERSION,
    candidates: [candidate("pol-paris", "SURNAME_ONLY")],
    ...overrides,
  };
}

const vocab = vocabularyFlagging("paris", "justice");

describe("classifyForTriage — ce qui se ferme", () => {
  it("ferme une décision dont tous les candidats sont des artefacts", () => {
    const verdict = classifyForTriage(
      row({
        candidates: [
          candidate("pol-paris", "SURNAME_ONLY"),
          candidate("pol-justice", "SURNAME_ONLY"),
        ],
      }),
      vocab,
      surnameOf
    );
    expect(verdict.kind).toBe("OUT_OF_SCOPE");
    expect(verdict.reason).toContain("2 candidats");
  });

  it("accepte les deux types d'appariement, avant et après la pénalité", () => {
    // Les lignes scorées avant #615 portent SURNAME_ONLY, celles d'après
    // SURNAME_ONLY_AMBIGUOUS. Les deux décrivent la même situation.
    const verdict = classifyForTriage(
      row({ candidates: [candidate("pol-paris", "SURNAME_ONLY_AMBIGUOUS")] }),
      vocab,
      surnameOf
    );
    expect(verdict.kind).toBe("OUT_OF_SCOPE");
  });

  it("traite aussi les UNDECIDED, pas seulement les NO_MATCH", () => {
    const verdict = classifyForTriage(row({ judgment: "UNDECIDED" }), vocab, surnameOf);
    expect(verdict.kind).toBe("OUT_OF_SCOPE");
  });
});

describe("classifyForTriage — ce qui reste à l'humain", () => {
  it("garde une décision rattachée à une affaire", () => {
    // Elle peut bloquer une publication : le panneau de #613 la traite depuis la fiche.
    const verdict = classifyForTriage(row({ affairId: "aff-1" }), vocab, surnameOf);
    expect(verdict.kind).toBe("KEEP");
    expect(verdict.reason).toContain("affaire");
  });

  it("garde une décision sans aucun candidat", () => {
    // File de découverte : le texte nomme peut-être un élu absent de la base.
    const verdict = classifyForTriage(row({ candidates: [] }), vocab, surnameOf);
    expect(verdict.kind).toBe("KEEP");
    expect(verdict.reason).toContain("découverte");
  });

  it("garde dès qu'un seul candidat échappe au vocabulaire", () => {
    const verdict = classifyForTriage(
      row({
        candidates: [
          candidate("pol-paris", "SURNAME_ONLY"),
          candidate("pol-melenchon", "SURNAME_ONLY"),
        ],
      }),
      vocab,
      surnameOf
    );
    expect(verdict.kind).toBe("KEEP");
    expect(verdict.reason).toContain("1 candidat");
  });

  it("garde un appariement sur nom complet, même si le patronyme est ambigu", () => {
    // « Jean Paris » n'est pas la ville : le palier au-dessus a déjà tranché.
    const verdict = classifyForTriage(
      row({ candidates: [candidate("pol-paris", "FULL_EXACT", 5.2)] }),
      vocab,
      surnameOf
    );
    expect(verdict.kind).toBe("KEEP");
  });

  it("garde un appariement par titre de civilité", () => {
    const verdict = classifyForTriage(
      row({ candidates: [candidate("pol-paris", "LEGAL_TITLE_SURNAME", 3.6)] }),
      vocab,
      surnameOf
    );
    expect(verdict.kind).toBe("KEEP");
  });

  it("ne touche jamais un SAME", () => {
    // Aucune confirmation automatique : la mesure n'a trouvé aucune décision en
    // file portant un external-id, donc toute confirmation restante est un jugement.
    const verdict = classifyForTriage(row({ judgment: "SAME" }), vocab, surnameOf);
    expect(verdict.kind).toBe("KEEP");
    expect(verdict.reason).toContain("SAME");
  });

  it("ne touche jamais un NOT_SAME déjà tranché", () => {
    const verdict = classifyForTriage(row({ judgment: "NOT_SAME" }), vocab, surnameOf);
    expect(verdict.kind).toBe("KEEP");
  });

  it("garde une décision dont le candidat est introuvable en base", () => {
    const verdict = classifyForTriage(
      row({ candidates: [candidate("pol-inconnu", "SURNAME_ONLY")] }),
      vocab,
      surnameOf
    );
    expect(verdict.kind).toBe("KEEP");
  });
});

describe("classifyForTriage — garde de version du résolveur", () => {
  it("refuse de trier une ligne scorée par un résolveur antérieur", () => {
    // Le cas qui a bloqué la première version de cette passe : avant v2, le
    // préfiltre ne pouvait pas atteindre « Le Pen », donc des textes sur sa
    // condamnation n'avaient que des artefacts pour candidats. Les fermer aurait
    // inscrit « hors périmètre » sur un échec de rappel.
    const verdict = classifyForTriage(row({ resolverVersion: "v1" }), vocab, surnameOf);
    expect(verdict.kind).toBe("KEEP");
    expect(verdict.reason).toContain("re-résoudre");
  });

  it("trie une ligne scorée par le résolveur courant", () => {
    const verdict = classifyForTriage(row({ resolverVersion: RESOLVER_VERSION }), vocab, surnameOf);
    expect(verdict.kind).toBe("OUT_OF_SCOPE");
  });
});

describe("TRIAGE_VERSION", () => {
  it("n'est pas une identité humaine, donc la garde de publication continue d'exiger un humain", () => {
    // L'invariant qui rend cette passe sûre : elle ne peut rien publier.
    expect(HUMAN_REVIEWERS).not.toContain(TRIAGE_VERSION);
  });

  it("porte un numéro de version, pour qu'un lot entier reste révocable", () => {
    expect(TRIAGE_VERSION).toMatch(/-v\d+$/);
  });
});
