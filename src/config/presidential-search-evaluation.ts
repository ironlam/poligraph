import type { ThemeCategory } from "@/generated/prisma";

export type PresidentialSearchExpectation =
  | { kind: "theme"; theme: ThemeCategory }
  | { kind: "candidacy"; name: string }
  | { kind: "none" };

export type PresidentialSearchEvaluationCase = {
  id: string;
  category: "exact" | "natural" | "candidate" | "approximate" | "negative";
  query: string;
  expectations: PresidentialSearchExpectation[];
};

const theme = (
  id: string,
  category: PresidentialSearchEvaluationCase["category"],
  query: string,
  expectedTheme: ThemeCategory
): PresidentialSearchEvaluationCase => ({
  id,
  category,
  query,
  expectations: [{ kind: "theme", theme: expectedTheme }],
});

const candidacy = (id: string, query: string, name: string): PresidentialSearchEvaluationCase => ({
  id,
  category: "candidate",
  query,
  expectations: [{ kind: "candidacy", name }],
});

/**
 * Jeu éditorial stable pour comparer recherche lexicale, vectorielle et hybride.
 * Les attentes portent sur la taxonomie ou l'identité, jamais sur une opinion ni sur un classement.
 */
export const PRESIDENTIAL_SEARCH_EVALUATION_CASES: readonly PresidentialSearchEvaluationCase[] = [
  theme("exact-logement", "exact", "logement", "LOGEMENT_URBANISME"),
  theme("exact-sante", "exact", "santé", "SANTE"),
  theme("exact-emploi", "exact", "emploi", "EMPLOI_TRAVAIL"),
  theme("exact-retraites", "exact", "retraites", "RETRAITES"),
  theme("exact-solidarites", "exact", "protection sociale", "SOLIDARITES_PROTECTION_SOCIALE"),
  theme("exact-economie", "exact", "budget", "ECONOMIE_BUDGET"),
  theme("exact-environnement", "exact", "écologie", "ENVIRONNEMENT_ENERGIE"),
  theme("exact-securite", "exact", "justice", "SECURITE_JUSTICE"),
  theme("exact-droits", "exact", "libertés", "SOCIETE_DROITS_LIBERTES"),
  theme("exact-education", "exact", "éducation", "EDUCATION_CULTURE"),
  theme("exact-immigration", "exact", "immigration", "IMMIGRATION"),
  theme("exact-transports", "exact", "transports", "TRANSPORTS"),
  theme("exact-agriculture", "exact", "agriculture", "AGRICULTURE_ALIMENTATION"),
  theme("exact-numerique", "exact", "numérique", "NUMERIQUE_TECH"),
  theme("exact-defense", "exact", "défense", "AFFAIRES_ETRANGERES_DEFENSE"),
  theme("exact-institutions", "exact", "institutions", "INSTITUTIONS"),

  theme(
    "natural-logement",
    "natural",
    "Que proposent les candidats pour réduire le coût du logement ?",
    "LOGEMENT_URBANISME"
  ),
  theme("natural-sante", "natural", "Comment lutter contre les déserts médicaux ?", "SANTE"),
  theme("natural-emploi", "natural", "Qui propose d'augmenter les salaires ?", "EMPLOI_TRAVAIL"),
  theme("natural-retraites", "natural", "À quel âge partir à la retraite ?", "RETRAITES"),
  theme(
    "natural-solidarites",
    "natural",
    "Quelles aides pour les personnes handicapées ?",
    "SOLIDARITES_PROTECTION_SOCIALE"
  ),
  theme("natural-economie", "natural", "Qui veut faire baisser les impôts ?", "ECONOMIE_BUDGET"),
  theme(
    "natural-environnement",
    "natural",
    "Comment sortir des énergies fossiles ?",
    "ENVIRONNEMENT_ENERGIE"
  ),
  theme(
    "natural-securite",
    "natural",
    "Faut-il créer davantage de places de prison ?",
    "SECURITE_JUSTICE"
  ),
  theme(
    "natural-droits",
    "natural",
    "Quelles mesures contre les discriminations ?",
    "SOCIETE_DROITS_LIBERTES"
  ),
  theme(
    "natural-education",
    "natural",
    "Comment réduire le nombre d'élèves par classe ?",
    "EDUCATION_CULTURE"
  ),
  theme(
    "natural-immigration",
    "natural",
    "Qui veut renforcer le contrôle des frontières ?",
    "IMMIGRATION"
  ),
  theme(
    "natural-transports",
    "natural",
    "Que proposent-ils pour les petites lignes ferroviaires ?",
    "TRANSPORTS"
  ),
  theme(
    "natural-agriculture",
    "natural",
    "Comment améliorer le revenu des agriculteurs ?",
    "AGRICULTURE_ALIMENTATION"
  ),
  theme("natural-numerique", "natural", "Comment réguler les réseaux sociaux ?", "NUMERIQUE_TECH"),
  theme(
    "natural-defense",
    "natural",
    "Quelles propositions sur l'aide militaire à l'Ukraine ?",
    "AFFAIRES_ETRANGERES_DEFENSE"
  ),
  theme(
    "natural-institutions",
    "natural",
    "Qui propose la proportionnelle à l'Assemblée ?",
    "INSTITUTIONS"
  ),

  candidacy("candidate-arthaud", "Nathalie Arthaud", "Nathalie Arthaud"),
  candidacy("candidate-attal", "Gabriel Attal", "Gabriel Attal"),
  candidacy("candidate-cazeneuve", "Bernard Cazeneuve", "Bernard Cazeneuve"),
  candidacy("candidate-lisnard", "David Lisnard", "David Lisnard"),
  candidacy("candidate-le-pen", "Marine Le Pen", "Marine Le Pen"),
  candidacy("candidate-melenchon", "Jean-Luc Mélenchon", "Jean-Luc Mélenchon"),
  candidacy("candidate-philippe", "Édouard Philippe", "Édouard Philippe"),
  candidacy("candidate-retailleau", "Bruno Retailleau", "Bruno Retailleau"),
  candidacy("candidate-tondelier", "Marine Tondelier", "Marine Tondelier"),
  candidacy("candidate-asselineau", "François Asselineau", "François Asselineau"),

  theme("approximate-loge", "approximate", "loge", "LOGEMENT_URBANISME"),
  theme("approximate-retratite", "approximate", "retratite", "RETRAITES"),
  theme("approximate-hopital", "approximate", "hopital", "SANTE"),
  theme("approximate-ecole", "approximate", "ecole", "EDUCATION_CULTURE"),

  {
    id: "negative-xylophone",
    category: "negative",
    query: "xylophone",
    expectations: [{ kind: "none" }],
  },
  {
    id: "negative-ornithorynque",
    category: "negative",
    query: "ornithorynque",
    expectations: [{ kind: "none" }],
  },
  {
    id: "negative-mars",
    category: "negative",
    query: "volcan sur mars",
    expectations: [{ kind: "none" }],
  },
  {
    id: "negative-tiramisu",
    category: "negative",
    query: "recette de tiramisu",
    expectations: [{ kind: "none" }],
  },
];
