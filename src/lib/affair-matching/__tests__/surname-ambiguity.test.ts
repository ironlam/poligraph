import { describe, it, expect } from "vitest";
import {
  buildSurnameVocabulary,
  normalizeForMatching,
  AMBIGUITY_RULES,
  type VocabularyInput,
} from "../surname-ambiguity";

/**
 * Wordings below are drawn from the real registry. The two lists that matter
 * are "must be flagged" and "must survive": each entry in the second list is a
 * name a previous formulation of these rules actually killed.
 */
const communes = [
  { name: "Paris", population: 2_103_778 },
  { name: "Toulouse", population: 514_819 },
  { name: "Marseille", population: 886_040 },
  { name: "Cahuzac", population: 356 },
  { name: "François", population: 999 },
  { name: "Boyer", population: 725 },
  { name: "Mathieu", population: 2_331 },
  { name: "Marie", population: 109 },
  { name: "Bourg-la-Reine", population: null },
];

const politicianNames = [
  // "Marine" is overwhelmingly a given name; one politician is named Mariné.
  ...Array.from({ length: 6 }, () => ({ firstName: "Marine", lastName: "Dupont" })),
  { firstName: "Sophie", lastName: "Mariné" },
  { firstName: "Claire", lastName: "Mariné" },
  // "Thomas" is genuinely both, and must stay usable.
  ...Array.from({ length: 66 }, () => ({ firstName: "Thomas", lastName: "Durand" })),
  ...Array.from({ length: 63 }, () => ({ firstName: "Alain", lastName: "Thomas" })),
  // Real surnames that must never be flagged.
  { firstName: "Jean-Luc", lastName: "Mélenchon" },
  { firstName: "Marine", lastName: "Le Pen" },
  { firstName: "Nicolas", lastName: "Sarkozy" },
  { firstName: "Jérôme", lastName: "Cahuzac" },
  ...Array.from({ length: 35 }, () => ({ firstName: "Valérie", lastName: "Boyer" })),
];

const corpus = [
  "La justice a ouvert une enquête. Justice sera rendue en appel.",
  "Le juge d'instruction a été saisi ; le juge a ordonné une expertise.",
  "Depuis 2019, la cour d'appel examine le dossier, mis en délibéré depuis mars.",
  "L'enquête est ouverte depuis deux ans, et depuis, aucune audience.",
  "Marine Le Pen a été condamnée par le tribunal de Paris.",
  "Nicolas Sarkozy a été renvoyé devant la cour. La cour statuera.",
  "Jean-Luc Mélenchon a porté plainte. La justice tranchera.",
];

/** Repeats the corpus so tokens clear the minimum-occurrence floor. */
function realisticInput(): VocabularyInput {
  const repeated: string[] = [];
  for (let i = 0; i < 12; i++) repeated.push(...corpus);
  return { communes, politicianNames, corpus: repeated };
}

describe("normalizeForMatching", () => {
  it("supprime les accents, la casse et normalise l'apostrophe typographique", () => {
    expect(normalizeForMatching("Mélenchon")).toBe("melenchon");
    expect(normalizeForMatching("  D’Estaing ")).toBe("d'estaing");
    expect(normalizeForMatching("LE PEN")).toBe("le pen");
  });

  it("ramène le trait d'union à une espace, comme tout le reste du dépôt", () => {
    // Le décalage qui a fait disparaître Nicolas Mayer-Rossignol : le préfiltre
    // le proposait sur la clé « mayer rossignol », name-quality cherchait
    // « mayer-rossignol » dans le texte et le disqualifiait comme absent.
    expect(normalizeForMatching("Dupond-Moretti")).toBe("dupond moretti");
    expect(normalizeForMatching("Mayer-Rossignol")).toBe(normalizeForMatching("Mayer Rossignol"));
  });
});

describe("buildSurnameVocabulary — couche communes", () => {
  const vocab = buildSurnameVocabulary(realisticInput());

  it("signale une grande ville", () => {
    expect(vocab.lookup("paris")).toMatchObject({ kind: "MAJOR_COMMUNE" });
    expect(vocab.lookup("toulouse")).toMatchObject({ kind: "MAJOR_COMMUNE" });
    expect(vocab.lookup("marseille")).toMatchObject({ kind: "MAJOR_COMMUNE" });
  });

  it("épargne un patronyme qui est aussi une petite commune", () => {
    // Le cas qui a invalidé la règle « est une commune » : Cahuzac compte 356
    // habitants, et une grande part des patronymes français viennent de toponymes.
    expect(vocab.lookup("cahuzac")).toBeNull();
    expect(vocab.lookup("boyer")).toBeNull();
    expect(vocab.lookup("marie")).toBeNull();
    expect(vocab.lookup("mathieu")).toBeNull();
  });

  it("traite une population absente comme zéro", () => {
    expect(vocab.lookup("bourg-la-reine")).toBeNull();
  });
});

describe("buildSurnameVocabulary — couche prénoms", () => {
  const vocab = buildSurnameVocabulary(realisticInput());

  it("signale un token porté surtout comme prénom", () => {
    expect(vocab.lookup("marine")).toMatchObject({ kind: "GIVEN_NAME" });
  });

  it("épargne un token réellement porté des deux façons", () => {
    // 66 prénoms contre 63 patronymes : le ratio est sous le seuil.
    expect(vocab.lookup("thomas")).toBeNull();
  });

  it("exige un nombre minimal de porteurs avant de conclure", () => {
    const vocab = buildSurnameVocabulary({
      communes: [],
      politicianNames: [{ firstName: "Aldebrande", lastName: "Zzz" }],
      corpus: [],
    });
    // Un seul porteur donne un ratio de 1,0 sans rien prouver.
    expect(vocab.lookup("aldebrande")).toBeNull();
  });
});

describe("buildSurnameVocabulary — couche mot commun", () => {
  const vocab = buildSurnameVocabulary(realisticInput());

  it("signale un mot qui vit en minuscule dans le corpus", () => {
    expect(vocab.lookup("justice")).toMatchObject({ kind: "COMMON_WORD" });
    expect(vocab.lookup("cour")).toMatchObject({ kind: "COMMON_WORD" });
    expect(vocab.lookup("juge")).toMatchObject({ kind: "COMMON_WORD" });
    expect(vocab.lookup("depuis")).toMatchObject({ kind: "COMMON_WORD" });
  });

  it("épargne un nom propre très fréquent dans le corpus", () => {
    // Le cas qui a invalidé la fréquence documentaire : « Le Pen » apparaît dans
    // 18% des documents du registre. La fréquence mesure la notoriété.
    expect(vocab.lookup("le pen")).toBeNull();
    expect(vocab.lookup("sarkozy")).toBeNull();
    expect(vocab.lookup("melenchon")).toBeNull();
  });

  it("ne juge pas un token vu trop peu de fois", () => {
    const vocab = buildSurnameVocabulary({
      communes: [],
      politicianNames: [],
      corpus: ["un mot rare et rare encore"],
    });
    expect(vocab.lookup("rare")).toBeNull();
  });

  it("laisse passer un patronyme à particule au lieu de le condamner", () => {
    // « de Villiers » se lit 100% minuscule à cause de sa particule : la couche
    // ne s'applique qu'aux patronymes d'un seul mot.
    const withParticle = buildSurnameVocabulary({
      communes: [],
      politicianNames: [],
      corpus: Array.from({ length: 40 }, () => "il de vient de la de ville de Villiers"),
    });
    expect(withParticle.lookup("de villiers")).toBeNull();
  });
});

describe("buildSurnameVocabulary — priorité des couches", () => {
  it("rend la couche qui déclenche en premier, commune avant prénom", () => {
    const vocab = buildSurnameVocabulary({
      communes: [{ name: "Valence", population: 64_458 }],
      politicianNames: Array.from({ length: 10 }, () => ({
        firstName: "Valence",
        lastName: "Dupont",
      })),
      corpus: [],
    });
    expect(vocab.lookup("valence")).toMatchObject({ kind: "MAJOR_COMMUNE" });
  });

  it("porte un détail lisible pour la revue", () => {
    const vocab = buildSurnameVocabulary(realisticInput());
    expect(vocab.lookup("paris")?.detail).toContain("habitants");
    expect(vocab.lookup("marine")?.detail).toContain("élus");
    expect(vocab.lookup("justice")?.detail).toContain("occurrences");
  });
});

describe("AMBIGUITY_RULES", () => {
  it("garde le seuil de population au-dessus des communes homonymes de patronymes", () => {
    // Boyer 725, François 999, Mathieu 2331 : le seuil doit rester franchement
    // au-dessus, sinon la règle tue des patronymes portés par des dizaines d'élus.
    expect(AMBIGUITY_RULES.minCommunePopulation).toBeGreaterThan(2_331);
  });
});
