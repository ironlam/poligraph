import type {
  AffairCategory,
  AffairStatus,
  Involvement,
  JurisdictionOrder,
} from "@/generated/prisma";

export interface AttributionRow {
  key:
    | "indirectWitnessConvicted"
    | "directNonPenalConvicted"
    | "directPreliminaryInquiry"
    | "directPenalConvicted"
    | "directPenalMiseEnExamen"
    | "directFavorableOutcome"
    | "victimViolence"
    | "plaintiffProbity"
    | "mentionedOnlyConvicted";
  involvement: Involvement;
  status: AffairStatus;
  jurisdictionOrder: JurisdictionOrder;
  category: AffairCategory;
  publicationStatus: "PUBLISHED";
  politician: { publicationStatus: "PUBLISHED" };
  expectedAdverse: boolean;
}

/**
 * Lignes de référence partagées par les tests d'attribution : seules une condamnation et une
 * mise en examen DIRECT d'ordre pénal entrent dans les agrégats à charge ; la mise en examen
 * sépare le prédicat à charge de celui des seules condamnations. Les trois dernières lignes
 * (victime, plaignant, simple mention) alimentent les facettes et les listings : la
 * plainte porte sur une catégorie hors violences, que le mode victime ne liste pas.
 */
type RowInput = Omit<AttributionRow, "publicationStatus" | "politician">;

const INPUT: RowInput[] = [
  {
    key: "indirectWitnessConvicted",
    involvement: "INDIRECT",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: false,
  },
  {
    key: "directNonPenalConvicted",
    involvement: "DIRECT",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "FINANCIER",
    category: "CORRUPTION",
    expectedAdverse: false,
  },
  {
    key: "directPreliminaryInquiry",
    involvement: "DIRECT",
    status: "ENQUETE_PRELIMINAIRE",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: false,
  },
  {
    key: "directPenalConvicted",
    involvement: "DIRECT",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: true,
  },
  {
    key: "directPenalMiseEnExamen",
    involvement: "DIRECT",
    status: "MISE_EN_EXAMEN",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: true,
  },
  {
    key: "directFavorableOutcome",
    involvement: "DIRECT",
    status: "RELAXE",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: false,
  },
  {
    key: "victimViolence",
    involvement: "VICTIM",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "PENAL",
    category: "VIOLENCE",
    expectedAdverse: false,
  },
  {
    key: "plaintiffProbity",
    involvement: "PLAINTIFF",
    status: "MISE_EN_EXAMEN",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: false,
  },
  {
    key: "mentionedOnlyConvicted",
    involvement: "MENTIONED_ONLY",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "PENAL",
    category: "CORRUPTION",
    expectedAdverse: false,
  },
];

export const ATTRIBUTION_ROWS: AttributionRow[] = INPUT.map((row) => ({
  ...row,
  publicationStatus: "PUBLISHED",
  politician: { publicationStatus: "PUBLISHED" },
}));
