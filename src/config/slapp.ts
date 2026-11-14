export const SLAPP_CRITERIA = [
  {
    id: "asymmetry",
    label: "Asymétrie de pouvoir",
    description:
      "Plaignant : personne publique, élu, ou entreprise de plus de 50 salariés. Défendeur : citoyen, journaliste, ONG, lanceur d'alerte, ou organisation à but non lucratif.",
    isExternalQualifier: false,
  },
  {
    id: "publicInterest",
    label: "Sujet d'intérêt général",
    description:
      "La parole ou l'acte attaqué porte sur : critique politique, investigation journalistique, alerte sanitaire ou environnementale, exercice de la liberté d'expression publique.",
    isExternalQualifier: false,
  },
  {
    id: "disproportion",
    label: "Disproportion",
    description:
      "Montant des dommages demandés supérieur à 10 fois les dommages réellement subis et démontrés, OU nature/cumul des poursuites manifestement disproportionnés.",
    isExternalQualifier: false,
  },
  {
    id: "outcomeUnfavorable",
    label: "Issue judiciaire défavorable au plaignant",
    description:
      "Débouté, prescription, retrait de plainte, transaction à l'avantage du défendeur, ou rejet en référé liberté. Critère absent quand l'affaire est encore en cours.",
    isExternalQualifier: false,
  },
  {
    id: "externalQualification",
    label: "Qualification externe par tiers identifié",
    description:
      "Au moins une source qualifiée explicite la nature SLAPP du cas : RSF, Article 19, syndicat journalistes, avocat spécialisé anti-SLAPP cité publiquement, décision judiciaire motivée invoquant l'article 32-1 du CPC, CASE Coalition.",
    isExternalQualifier: true,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  isExternalQualifier: boolean;
}[];
export type CriterionState = {
  met: boolean;
  note?: string;
};

export type ExternalQualificationState = CriterionState & {
  source?: string;
  qualifierName?: string;
};

export type QualificationRule = "3of5" | "criterion5_only";

export type SlappCriteriaPayload = {
  asymmetry: CriterionState;
  publicInterest: CriterionState;
  disproportion: CriterionState;
  outcomeUnfavorable: CriterionState;
  externalQualification: ExternalQualificationState;
  qualificationRule: QualificationRule;
};

export const SLAPP_DIRECTIVE_EU = {
  identifier: "2024/1069",
  title:
    "Directive (UE) 2024/1069 sur la protection des personnes qui prennent part au débat public contre les procédures judiciaires manifestement infondées ou abusives",
  url: "https://eur-lex.europa.eu/eli/dir/2024/1069/oj",
  shortName: "Directive anti-SLAPP",
} as const;
