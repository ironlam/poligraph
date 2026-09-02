import { describe, it, expect, vi } from "vitest";

// Mock db so the module can be imported without a database connection
// (sameCategoryFamily is pure, but matching.ts imports @/lib/db at module level).
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  EVOLUTION_MIN_OVERLAP_RATIO,
  classifyAffairMatches,
  evolutionMatch,
  isPreDecisionStatus,
  pairingRestsOnWildcard,
  pickConfidentMatch,
  sameCategoryFamily,
  significantTitleWords,
  titleContainmentMatch,
  titleVocabularyOverlap,
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

describe("classifyAffairMatches", () => {
  it("propose une évolution seulement quand la cible plausible est unique", () => {
    expect(
      classifyAffairMatches([
        {
          affairId: "aff_1",
          confidence: "POSSIBLE",
          score: 0.55,
          matchedBy: "evolution-title-overlap",
        },
      ])
    ).toMatchObject({ kind: "UNIQUE_EVOLUTION", match: { affairId: "aff_1" } });
  });

  it("reste ambigu si un autre signal POSSIBLE vise une autre affaire", () => {
    expect(
      classifyAffairMatches([
        {
          affairId: "aff_1",
          confidence: "POSSIBLE",
          score: 0.55,
          matchedBy: "evolution-title-overlap",
        },
        {
          affairId: "aff_2",
          confidence: "POSSIBLE",
          score: 0.5,
          matchedBy: "title-partial",
        },
      ])
    ).toMatchObject({ kind: "POSSIBLE_AMBIGUOUS" });
  });

  it("préserve les rapprochements confiants et ne choisit pas entre deux HIGH", () => {
    expect(
      classifyAffairMatches([
        { affairId: "aff_1", confidence: "HIGH", score: 0.9, matchedBy: "title-exact" },
      ])
    ).toMatchObject({ kind: "CONFIDENT_MATCH" });
    expect(
      classifyAffairMatches([
        { affairId: "aff_1", confidence: "HIGH", score: 0.9, matchedBy: "title-exact" },
        { affairId: "aff_2", confidence: "HIGH", score: 0.9, matchedBy: "title-exact" },
      ])
    ).toMatchObject({ kind: "CONFIDENT_AMBIGUOUS" });
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

// Issue #763 — avant toute décision, une affaire n'a ni ECLI, ni numéro de pourvoi,
// ni date de verdict : les priorités 1, 2 et 5 ne peuvent pas se déclencher. Il ne
// reste que le titre, et la containment échoue dès qu'un article de suivi reformule
// le titre au lieu de l'allonger. Trois brouillons Bagayoko ont ainsi été créés à
// deux minutes d'intervalle pour une seule enquête.
describe("isPreDecisionStatus — issue #763", () => {
  it("reconnaît les étapes où l'affaire bouge encore", () => {
    for (const status of [
      "ENQUETE_PRELIMINAIRE",
      "INSTRUCTION",
      "MISE_EN_EXAMEN",
      "RENVOI_TRIBUNAL",
      "PROCES_EN_COURS",
    ]) {
      expect(isPreDecisionStatus(status)).toBe(true);
    }
  });

  it("exclut les étapes postérieures à une décision, que la date de verdict discrimine", () => {
    for (const status of [
      "CONDAMNATION_PREMIERE_INSTANCE",
      "APPEL_EN_COURS",
      "POURVOI_EN_CASSATION",
      "CONDAMNATION_DEFINITIVE",
      "RELAXE",
      "NON_LIEU",
      "CLASSEMENT_SANS_SUITE",
    ]) {
      expect(isPreDecisionStatus(status)).toBe(false);
    }
  });

  it("un statut absent ne permet aucune conclusion", () => {
    expect(isPreDecisionStatus(null)).toBe(false);
    expect(isPreDecisionStatus(undefined)).toBe(false);
  });
});

describe("titleVocabularyOverlap — issue #763", () => {
  it("compte les mots partagés et le ratio de Jaccard", () => {
    // {detournement, fonds, publics, ratp} contre
    // {detournement, fonds, publics, emploi, ratp} : 4 partagés sur 5 unis.
    const { shared, ratio } = titleVocabularyOverlap(
      "detournement de fonds publics a la ratp",
      "detournement de fonds publics lie a l'emploi a la ratp"
    );
    expect(shared).toBe(4);
    expect(ratio).toBeCloseTo(0.8, 2);
  });

  it("reste bas quand un libellé court est noyé dans un titre descriptif (#520)", () => {
    // Le coefficient de recouvrement donnerait 1.0 ici : c'est exactement le faux
    // positif que #520 a corrigé, et la raison du choix de Jaccard.
    const { ratio } = titleVocabularyOverlap(
      "diffamation",
      "condamnation definitive pour diffamation envers patrick klugman"
    );
    expect(ratio).toBeLessThan(EVOLUTION_MIN_OVERLAP_RATIO);
  });

  it("vaut zéro sans vocabulaire commun", () => {
    expect(titleVocabularyOverlap("fraude fiscale", "emploi fictif").shared).toBe(0);
    expect(titleVocabularyOverlap("fraude fiscale", "emploi fictif").ratio).toBe(0);
  });

  it("ne divise pas par zéro sur des titres sans mot significatif", () => {
    expect(titleVocabularyOverlap("vol de la clé", "")).toEqual({ shared: 0, ratio: 0 });
  });
});

// Fixtures relevées en production sur les 189 affaires pré-décision : au-dessus du
// seuil, chaque paire est une seule histoire éclatée entre plusieurs imports ;
// en dessous, deux dossiers distincts ne partagent que le vocabulaire générique de
// leur catégorie.
describe("evolutionMatch — issue #763", () => {
  it("rapproche deux formulations d'une même enquête (Bagayoko, 0.80)", () => {
    const result = evolutionMatch(
      "enquete pour detournement de fonds publics a la ratp",
      "enquete pour detournement de fonds publics lie a l'emploi a la ratp",
      true
    );
    expect(result?.matchedBy).toBe("evolution-title-overlap");
    expect(result?.confidence).toBe("POSSIBLE");
  });

  it("rapproche la paire qui a motivé le signal, que la containment rate (Bagayoko, 0.43)", () => {
    // Ni l'un ni l'autre n'est sous-chaîne : « et cumul d'emplois » contre
    // « lié à l'emploi à la RATP ». C'est le cas que le matcher laissait passer.
    const a = "enquete pour detournement de fonds publics et cumul d'emplois";
    const b = "enquete pour detournement de fonds publics lie a l'emploi a la ratp";
    expect(titleContainmentMatch(a, b, true)).toBeNull();
    expect(evolutionMatch(a, b, true)).not.toBeNull();
  });

  it("rapproche malgré une catégorie repliée sur AUTRE (Mbappé, 0.83)", () => {
    // AUTRE contre INCITATION_HAINE : le wildcard est accepté ici parce que le
    // vocabulaire fournit le second signal réclamé par #521.
    expect(
      evolutionMatch(
        "propos racistes et menaces envers kylian mbappe",
        "enquete pour propos racistes envers kylian mbappe",
        true
      )
    ).not.toBeNull();
  });

  it("rapproche deux signalements du même fait (Vinted, 0.40 — au seuil)", () => {
    expect(
      evolutionMatch(
        "signalement de trafics d'enfants presumes sur vinted",
        "soupcons de trafic d'enfants sur vinted",
        true
      )
    ).not.toBeNull();
  });

  it("écarte deux détournements distincts du même élu (Ciotti, 0.30)", () => {
    expect(
      evolutionMatch(
        "detournement de fonds publics visant ciotti et ses collaborateurs (mai 2024)",
        "detournement de fonds publics lors de la campagne legislative de 2022",
        true
      )
    ).toBeNull();
  });

  it("écarte deux dossiers européens distincts (Bardella, 0.25)", () => {
    expect(
      evolutionMatch(
        "soupcons d'emploi fictif de jordan bardella au parlement europeen",
        "depenses irregulieres du groupe patriots au parlement europeen",
        true
      )
    ).toBeNull();
  });

  it("exige un vocabulaire commun, pas seulement une famille partagée", () => {
    expect(evolutionMatch("fraude fiscale aggravee", "emploi fictif au senat", true)).toBeNull();
  });

  it("exige deux mots partagés : un seul ne nomme rien", () => {
    // Ratio 1/2 = 0.50, au-dessus du seuil, mais un seul mot partagé.
    expect(evolutionMatch("favoritisme", "favoritisme avere", true)).toBeNull();
  });

  it("ne rapproche rien hors d'une famille commune", () => {
    expect(
      evolutionMatch(
        "menaces de mort contre le maire d'agen",
        "menaces de mort contre le maire d'agen",
        false
      )
    ).toBeNull();
  });

  it("reste sous le seuil de pickConfidentMatch : jamais d'enrichissement silencieux", () => {
    const result = evolutionMatch(
      "enquete pour detournement de fonds publics a la ratp",
      "enquete pour detournement de fonds publics lie a l'emploi a la ratp",
      true
    )!;
    expect(pickConfidentMatch([{ affairId: "a", ...result }]).kind).toBe("none");
  });
});
