import { describe, it, expect, vi } from "vitest";

// Mock db so the module can be imported without a database connection
// (sameCategoryFamily is pure, but matching.ts imports @/lib/db at module level).
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  pairingRestsOnWildcard,
  pickConfidentMatch,
  sameCategoryFamily,
  significantTitleWords,
  titleContainmentMatch,
  titlesShareVocabulary,
  verdictDatesConflict,
} from "./matching";

// We need to test the normalizeAffairTitle function indirectly since it's private.
// Instead, we test the exported behavior by importing and calling it via a test helper.
// For now, test the normalization logic inline.

function normalizeAffairTitle(title: string, politicianName?: string): string {
  let normalized = title
    .normalize("NFC")
    .replace(/^\[À VÉRIFIER\]\s*/i, "")
    .trim()
    .toLowerCase();

  if (politicianName) {
    const name = politicianName.toLowerCase().normalize("NFC");
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`), "");
    normalized = normalized.replace(new RegExp(`\\bde\\s+${escaped}\\s+pour\\s+`, "g"), "");
    normalized = normalized.replace(new RegExp(`\\bcontre\\s+${escaped}\\s*`, "g"), "");
    normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, "g"), "");
    normalized = normalized.replace(/\s{2,}/g, " ").trim();
  }

  return normalized;
}

describe("normalizeAffairTitle", () => {
  it("strips [À VÉRIFIER] prefix", () => {
    expect(normalizeAffairTitle("[À VÉRIFIER] Fraude fiscale")).toBe("fraude fiscale");
  });

  it("strips politician name with em dash suffix (discover-affairs format)", () => {
    const result = normalizeAffairTitle(
      "Violences volontaires en réunion — Raphaël Arnault",
      "Raphaël Arnault"
    );
    expect(result).toBe("violences volontaires en réunion");
  });

  it("strips politician name with 'de X pour' pattern (manual format)", () => {
    const result = normalizeAffairTitle(
      "Condamnation de Raphaël Arnault pour violences volontaires en réunion",
      "Raphaël Arnault"
    );
    expect(result).toBe("condamnation violences volontaires en réunion");
  });

  it("strips politician name with 'contre' pattern", () => {
    const result = normalizeAffairTitle(
      "Plainte pour menace de mort déposée contre Nicolas Sarkozy",
      "Nicolas Sarkozy"
    );
    expect(result).toBe("plainte pour menace de mort déposée");
  });

  it("enables substring matching between different title formats", () => {
    const name = "Raphaël Arnault";
    const a = normalizeAffairTitle("Violences volontaires en réunion — Raphaël Arnault", name);
    const b = normalizeAffairTitle(
      "Condamnation de Raphaël Arnault pour violences volontaires en réunion",
      name
    );
    // After normalization, one should contain the other
    expect(b.includes(a) || a.includes(b)).toBe(true);
  });

  it("handles Unicode normalization (NFC vs NFD)", () => {
    // é as NFC (U+00E9) vs NFD (e + U+0301)
    const nfc = "Fraude fiscale — René Dupont";
    const nfd = "Fraude fiscale — Rene\u0301 Dupont";
    expect(normalizeAffairTitle(nfc, "René Dupont")).toBe(
      normalizeAffairTitle(nfd, "Rene\u0301 Dupont")
    );
  });

  it("works without politician name", () => {
    expect(normalizeAffairTitle("Fraude fiscale")).toBe("fraude fiscale");
  });
});

describe("sameCategoryFamily", () => {
  it("matches identical categories", () => {
    expect(sameCategoryFamily("MENACE", "MENACE")).toBe(true);
  });

  it("matches sibling categories within the probity family", () => {
    expect(sameCategoryFamily("DETOURNEMENT_FONDS_PUBLICS", "FAVORITISME")).toBe(true);
    expect(sameCategoryFamily("CONFLIT_INTERETS", "PRISE_ILLEGALE_INTERETS")).toBe(true);
  });

  it("matches sibling categories within the persons family", () => {
    expect(sameCategoryFamily("VIOLENCE", "MENACE")).toBe(true);
    expect(sameCategoryFamily("AGRESSION_SEXUELLE", "HARCELEMENT_SEXUEL")).toBe(true);
  });

  it("treats AUTRE as a wildcard", () => {
    expect(sameCategoryFamily("AUTRE", "DETOURNEMENT_FONDS_PUBLICS")).toBe(true);
    expect(sameCategoryFamily("MENACE", "AUTRE")).toBe(true);
  });

  it("rejects categories from different families", () => {
    expect(sameCategoryFamily("MENACE", "FRAUDE_FISCALE")).toBe(false);
    expect(sameCategoryFamily("DIFFAMATION", "VIOLENCE")).toBe(false);
  });

  it("rejects unknown categories that are not AUTRE", () => {
    expect(sameCategoryFamily("UNKNOWN_A", "UNKNOWN_B")).toBe(false);
  });
});

// Issue #520 — a short Wikidata offense label is a substring of most descriptive
// titles in the same category, so bidirectional containment used to return HIGH
// for genuinely distinct affairs. Measured on production data: the label
// "Diffamation" matched three separate Zemmour defamation cases (2012, 2018,
// 2025) in HIGH, and discover-affairs took the first one arbitrarily.
describe("titleContainmentMatch — issue #520", () => {
  it("garde le HIGH sur une containment substantielle, même catégorie", () => {
    // Le cas légitime que la containment protège : deux formats d'import du même
    // fait. Ratio 32/45 = 0.71.
    const result = titleContainmentMatch(
      "violences volontaires en réunion",
      "condamnation violences volontaires en réunion",
      true
    );
    expect(result?.confidence).toBe("HIGH");
    expect(result?.matchedBy).toBe("title+category");
  });

  it("rétrograde un libellé court noyé dans un titre descriptif", () => {
    // Ratio 11/63 = 0.17 : vocabulaire partagé, pas doublon.
    const result = titleContainmentMatch(
      "diffamation",
      "condamnation definitive pour diffamation envers patrick klugman",
      true
    );
    expect(result?.confidence).not.toBe("HIGH");
    expect(result?.confidence).toBe("POSSIBLE");
  });

  it("rétrograde aussi « injure » dans un titre long", () => {
    // Ratio 6/60 = 0.10.
    const result = titleContainmentMatch(
      "injure",
      "condamnation pour injure envers les mineurs isoles etrangers",
      true
    );
    expect(result?.confidence).toBe("POSSIBLE");
  });

  it("ne signale rien sans containment", () => {
    expect(titleContainmentMatch("fraude fiscale", "emploi fictif", true)).toBeNull();
  });

  it("reste POSSIBLE sur containment substantielle mais catégorie différente", () => {
    const result = titleContainmentMatch(
      "violences volontaires en réunion",
      "condamnation violences volontaires en réunion",
      false
    );
    expect(result?.confidence).toBe("POSSIBLE");
    expect(result?.matchedBy).toBe("title-partial");
  });

  it("conserve le signal POSSIBLE, consommé par reconcile-affairs", () => {
    // Rien ne doit disparaître : reconcile-affairs.ts compte les POSSIBLE.
    for (const [a, b] of [
      ["diffamation", "condamnation definitive pour diffamation envers patrick klugman"],
      ["injure", "condamnation pour injure envers les mineurs isoles etrangers"],
    ] as const) {
      expect(titleContainmentMatch(a, b, true)).not.toBeNull();
    }
  });
});

// Issue #520, second mechanism: when no existing affair matches, discover-affairs
// creates one whose title is the bare offense label. Every later claim carrying the
// same label then matches it in title-exact, so distinct convictions collapse onto
// one affair, each proposing its own verdict date. The verdict date is the
// discriminator that was available but never passed to the matcher.
describe("verdictDatesConflict — issue #520", () => {
  it("deux dates éloignées sont un signal de condamnations distinctes", () => {
    expect(verdictDatesConflict(new Date("2011-02-18"), new Date("2024-02-22"))).toBe(true);
  });

  it("deux dates proches ne s'opposent pas (même décision, sources divergentes)", () => {
    expect(verdictDatesConflict(new Date("2024-02-22"), new Date("2024-03-05"))).toBe(false);
  });

  it("une date absente ne permet aucune conclusion", () => {
    expect(verdictDatesConflict(null, new Date("2024-02-22"))).toBe(false);
    expect(verdictDatesConflict(new Date("2024-02-22"), undefined)).toBe(false);
    expect(verdictDatesConflict(null, null)).toBe(false);
  });

  it("dates identiques : aucun conflit", () => {
    const d = new Date("2024-02-22");
    expect(verdictDatesConflict(d, new Date(d))).toBe(false);
  });
});

// Issue #520 — the three importers each took the first HIGH match without noticing
// several affairs could tie. Under the project's priority (a false match costs more
// than a draft to triage), ambiguity must never resolve silently: creating a
// duplicate draft that merge tooling can fold in is strictly safer than enriching
// possibly the wrong affair.
describe("pickConfidentMatch — issue #520", () => {
  const m = (affairId: string, confidence: "CERTAIN" | "HIGH" | "POSSIBLE", score: number) => ({
    affairId,
    confidence,
    score,
    matchedBy: "test",
  });

  it("un seul HIGH : on rapproche", () => {
    const r = pickConfidentMatch([m("a", "HIGH", 0.85), m("b", "POSSIBLE", 0.3)]);
    expect(r.kind).toBe("match");
    expect(r.kind === "match" && r.match.affairId).toBe("a");
  });

  it("plusieurs HIGH : ambigu, on ne rapproche pas", () => {
    const r = pickConfidentMatch([m("a", "HIGH", 0.75), m("b", "HIGH", 0.75)]);
    expect(r.kind).toBe("ambiguous");
    expect(r.kind === "ambiguous" && r.candidates).toHaveLength(2);
  });

  it("un CERTAIN l'emporte sur des HIGH concurrents (ECLI est unique)", () => {
    const r = pickConfidentMatch([
      m("a", "CERTAIN", 1),
      m("b", "HIGH", 0.75),
      m("c", "HIGH", 0.75),
    ]);
    expect(r.kind).toBe("match");
    expect(r.kind === "match" && r.match.affairId).toBe("a");
  });

  it("aucun HIGH : rien, même avec des POSSIBLE", () => {
    expect(pickConfidentMatch([m("a", "POSSIBLE", 0.5)]).kind).toBe("none");
    expect(pickConfidentMatch([]).kind).toBe("none");
  });

  it("plusieurs CERTAIN : ambigu aussi, on ne devine pas", () => {
    expect(pickConfidentMatch([m("a", "CERTAIN", 1), m("b", "CERTAIN", 1)]).kind).toBe("ambiguous");
  });
});

// Issue #521 — AUTRE pairs with every family, so on its own it carries no
// information about the facts. Fixtures use generic legal phrasings rather than
// real titles: the pair that motivated this guard is a pair of unpublished drafts.
describe("pairingRestsOnWildcard — issue #521", () => {
  it("est vrai quand seul AUTRE rapproche les deux catégories", () => {
    expect(pairingRestsOnWildcard("AUTRE", "AGRESSION_SEXUELLE")).toBe(true);
    expect(pairingRestsOnWildcard("RECEL", "AUTRE")).toBe(true);
  });

  it("est faux pour AUTRE contre AUTRE : l'égalité suffit", () => {
    expect(pairingRestsOnWildcard("AUTRE", "AUTRE")).toBe(false);
  });

  it("est faux pour deux catégories identiques", () => {
    expect(pairingRestsOnWildcard("MENACE", "MENACE")).toBe(false);
  });

  it("est faux quand une famille nommée les rapproche déjà", () => {
    expect(pairingRestsOnWildcard("DETOURNEMENT_FONDS_PUBLICS", "FAVORITISME")).toBe(false);
    expect(pairingRestsOnWildcard("VIOLENCE", "MENACE")).toBe(false);
    expect(pairingRestsOnWildcard("DIFFAMATION", "INJURE")).toBe(false);
  });

  it("est faux quand rien ne les rapproche", () => {
    expect(pairingRestsOnWildcard("MENACE", "FRAUDE_FISCALE")).toBe(false);
  });
});

describe("significantTitleWords — issue #521", () => {
  it("replie les accents", () => {
    expect(significantTitleWords("Étouffement")).toEqual(new Set(["etouffement"]));
    expect(significantTitleWords("referes")).toEqual(significantTitleWords("référés"));
    expect(significantTitleWords("Détention")).toEqual(significantTitleWords("detention"));
  });

  it("écarte les mots trop courts pour identifier quoi que ce soit", () => {
    expect(significantTitleWords("Vol de la clé")).toEqual(new Set([]));
  });

  it("écarte le vocabulaire judiciaire et éditorial générique", () => {
    for (const filler of ["Affaire", "Enquête", "Procédure", "Plainte", "Soupçons", "Accusation"]) {
      expect(significantTitleWords(`${filler} Untel`)).toEqual(new Set(["untel"]));
    }
  });

  it("garde les mots qui nomment les faits", () => {
    expect(significantTitleWords("Tentative d'étouffement judiciaire")).toEqual(
      new Set(["tentative", "etouffement", "judiciaire"])
    );
  });
});

describe("titlesShareVocabulary — issue #521", () => {
  it("reconnaît deux formulations des mêmes faits", () => {
    expect(
      titlesShareVocabulary(
        "Soupçons de tentative d'étouffement d'une procédure",
        "Tentative présumée d'étouffement d'une procédure"
      )
    ).toBe(true);
  });

  it("rejette deux faits qui ne partagent aucun vocabulaire", () => {
    // Forme du faux positif relevé au tri de #525 : une ordonnance de référé sur
    // des conditions de détention face à une affaire criminelle sans rapport.
    expect(
      titlesShareVocabulary(
        "Ordonnance du juge des référés sur les conditions de détention",
        "Enlèvement suivi de meurtre"
      )
    ).toBe(false);
  });

  it("ne se laisse pas prendre par le seul mot « affaire »", () => {
    expect(titlesShareVocabulary("Affaire Untel", "Affaire Machin")).toBe(false);
  });

  it("ne se laisse pas prendre par une accumulation de mots génériques", () => {
    expect(
      titlesShareVocabulary(
        "Enquête préliminaire ouverte dans une procédure",
        "Plainte déposée dans une procédure, enquête en cours"
      )
    ).toBe(false);
  });

  it("accepte un seul nom partagé, qui suffit comme piste de relecture", () => {
    expect(
      titlesShareVocabulary(
        "Gestion présumée illégale au Havre",
        "Soupçons de favoritisme au Havre"
      )
    ).toBe(true);
  });

  it("rapproche malgré une orthographe accentuée différente", () => {
    expect(
      titlesShareVocabulary("Ordonnance de référé", "Décision rendue en refere sur le fond")
    ).toBe(true);
  });
});
