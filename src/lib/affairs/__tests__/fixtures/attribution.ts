import type { AffairStatus, Involvement, JurisdictionOrder } from "@/generated/prisma";

export interface AttributionRow {
  key:
    | "indirectWitnessConvicted"
    | "directNonPenalConvicted"
    | "directPreliminaryInquiry"
    | "directPenalConvicted"
    | "directFavorableOutcome";
  involvement: Involvement;
  status: AffairStatus;
  jurisdictionOrder: JurisdictionOrder;
  publicationStatus: "PUBLISHED";
  politician: { publicationStatus: "PUBLISHED" };
  expectedAdverse: boolean;
}

/**
 * Lignes de référence partagées par les tests d'attribution : seule une condamnation
 * DIRECT d'ordre pénal entre dans les agrégats à charge.
 */
type RowInput = Omit<AttributionRow, "publicationStatus" | "politician">;

const INPUT: RowInput[] = [
  {
    key: "indirectWitnessConvicted",
    involvement: "INDIRECT",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "PENAL",
    expectedAdverse: false,
  },
  {
    key: "directNonPenalConvicted",
    involvement: "DIRECT",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "FINANCIER",
    expectedAdverse: false,
  },
  {
    key: "directPreliminaryInquiry",
    involvement: "DIRECT",
    status: "ENQUETE_PRELIMINAIRE",
    jurisdictionOrder: "PENAL",
    expectedAdverse: false,
  },
  {
    key: "directPenalConvicted",
    involvement: "DIRECT",
    status: "CONDAMNATION_DEFINITIVE",
    jurisdictionOrder: "PENAL",
    expectedAdverse: true,
  },
  {
    key: "directFavorableOutcome",
    involvement: "DIRECT",
    status: "RELAXE",
    jurisdictionOrder: "PENAL",
    expectedAdverse: false,
  },
];

export const ATTRIBUTION_ROWS: AttributionRow[] = INPUT.map((row) => ({
  ...row,
  publicationStatus: "PUBLISHED",
  politician: { publicationStatus: "PUBLISHED" },
}));
