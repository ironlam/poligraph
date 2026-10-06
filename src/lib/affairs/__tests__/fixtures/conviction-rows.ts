import type {
  AffairCategory,
  AffairSeverity,
  AffairStatus,
  JurisdictionOrder,
} from "@/generated/prisma";

export interface ConvictionRow {
  involvement: "DIRECT";
  status: AffairStatus;
  jurisdictionOrder: JurisdictionOrder;
  category: AffairCategory;
  severity: AffairSeverity;
  publicationStatus: "PUBLISHED";
  politician: { publicationStatus: "PUBLISHED" };
}

type RowInput = Partial<Pick<ConvictionRow, "jurisdictionOrder" | "category" | "severity">> &
  Pick<ConvictionRow, "status">;

const row = (input: RowInput): ConvictionRow => ({
  involvement: "DIRECT",
  jurisdictionOrder: "PENAL",
  category: "CORRUPTION",
  severity: "GRAVE",
  ...input,
  publicationStatus: "PUBLISHED",
  politician: { publicationStatus: "PUBLISHED" },
});

/**
 * Lignes de référence pour les compteurs de condamnation et le badge probité.
 * Fichier distinct de ATTRIBUTION_ROWS pour ne pas modifier les comptes des tests d'attribution.
 */
export const CONVICTION_ROWS = {
  definitiveCorruptionGrave: row({ status: "CONDAMNATION_DEFINITIVE" }),
  definitiveHateCritique: row({
    status: "CONDAMNATION_DEFINITIVE",
    category: "INCITATION_HAINE",
    severity: "CRITIQUE",
  }),
  definitiveCampaignFinancing: row({
    status: "CONDAMNATION_DEFINITIVE",
    category: "FINANCEMENT_ILLEGAL_CAMPAGNE",
    severity: "CRITIQUE",
  }),
  firstInstanceCorruption: row({ status: "CONDAMNATION_PREMIERE_INSTANCE" }),
  appealCorruption: row({ status: "APPEL_EN_COURS" }),
  cassationCorruption: row({ status: "POURVOI_EN_CASSATION" }),
  nonPenalDefinitive: row({ status: "CONDAMNATION_DEFINITIVE", jurisdictionOrder: "FINANCIER" }),
  preliminaryInquiry: row({ status: "ENQUETE_PRELIMINAIRE" }),
  miseEnExamen: row({ status: "MISE_EN_EXAMEN" }),
  relaxe: row({ status: "RELAXE" }),
} satisfies Record<string, ConvictionRow>;
