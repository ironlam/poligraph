/**
 * Wikidata offense Q-IDs → Poligraph AffairCategory/AffairStatus mapping
 *
 * Maps Wikidata criminal offense entities to our internal affair enums.
 * Used by the historical affair discovery script to convert Wikidata
 * P1399 (convicted of) and P1595 (charge) claims into Affair records.
 *
 * Property semantics:
 *   - P1399 (convicted of) → CONDAMNATION_DEFINITIVE
 *   - P1595 (charge)       → MISE_EN_EXAMEN
 *
 * Also exports CRIME_CATEGORY_MAP (text-based crime label matching)
 * used by judilibre-mapping.ts for Cour de cassation decisions.
 */

import type { AffairCategory, AffairStatus } from "@/generated/prisma";

// ============================================================================
// Types
// ============================================================================

export interface WikidataAffairMapping {
  /** Our internal affair category */
  category: AffairCategory;
  /** Status when the Wikidata property is P1399 (convicted of) */
  statusP1399: AffairStatus;
  /** Status when the Wikidata property is P1595 (charge) */
  statusP1595: AffairStatus;
  /** French label for the offense */
  label: string;
}

// ============================================================================
// Offense Q-ID → Category mapping
// ============================================================================

export const WIKIDATA_OFFENSE_MAP: Record<string, WikidataAffairMapping> = {
  // --- Corruption & influence ---
  Q852973: {
    category: "CORRUPTION",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Corruption",
  },
  Q17144338: {
    category: "CORRUPTION_PASSIVE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Corruption passive",
  },
  Q1138405: {
    category: "TRAFIC_INFLUENCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Trafic d'influence",
  },
  Q3066193: {
    category: "FAVORITISME",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Favoritisme",
  },

  // --- Public funds & financial ---
  Q3402696: {
    category: "PRISE_ILLEGALE_INTERETS",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Prise illégale d'intérêts",
  },
  Q2727313: {
    category: "DETOURNEMENT_FONDS_PUBLICS",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Détournement de fonds publics",
  },
  Q179126: {
    category: "FRAUDE_FISCALE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Fraude fiscale",
  },
  Q165513: {
    category: "BLANCHIMENT",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Blanchiment d'argent",
  },
  Q2819748: {
    category: "ABUS_BIENS_SOCIAUX",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Abus de biens sociaux",
  },
  Q338193: {
    category: "ABUS_CONFIANCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Abus de confiance",
  },

  // --- Employment & campaign finance ---
  Q2362986: {
    category: "EMPLOI_FICTIF",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Emploi fictif",
  },
  Q112107068: {
    category: "FINANCEMENT_ILLEGAL_CAMPAGNE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Financement illégal de campagne",
  },

  // --- Harassment & violence ---
  Q1133481: {
    category: "HARCELEMENT_MORAL",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Harcèlement moral",
  },
  Q331953: {
    category: "HARCELEMENT_SEXUEL",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Harcèlement sexuel",
  },
  Q188681: {
    category: "AGRESSION_SEXUELLE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Agression sexuelle",
  },

  // --- Fraud & forgery ---
  Q28140925: {
    category: "FAUX_ET_USAGE_FAUX",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Faux et usage de faux",
  },
  Q1393907: {
    category: "RECEL",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Recel",
  },

  // --- Speech offenses ---
  Q182688: {
    category: "DIFFAMATION",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Diffamation",
  },
  Q274907: {
    category: "INCITATION_HAINE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Incitation à la haine",
  },

  // --- Combined / compound offenses ---
  Q105440629: {
    category: "FINANCEMENT_ILLEGAL_CAMPAGNE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Financement illégal de campagne électorale",
  },
  Q16544000: {
    category: "CORRUPTION",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Corruption et trafic d'influence",
  },
  Q3627314: {
    category: "AUTRE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Association de malfaiteurs",
  },

  // --- Violence / assault ---
  Q365680: {
    category: "VIOLENCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Voie de fait",
  },
  Q5467425: {
    category: "VIOLENCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Violence",
  },
  Q111341728: {
    category: "VIOLENCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Violences volontaires en réunion",
  },
  Q5153528: {
    category: "VIOLENCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Violences conjugales",
  },
  Q113630214: {
    category: "VIOLENCE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Violences sur mineur par ascendant",
  },

  // --- Hate speech / defamation (additional Q-IDs) ---
  Q43442: {
    category: "INCITATION_HAINE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Incitation à la haine raciale",
  },
  Q191783: {
    category: "DIFFAMATION",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Diffamation",
  },
  Q11789033: {
    category: "DIFFAMATION",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Diffamation (droit français)",
  },
  Q3086119: {
    category: "INJURE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Injure",
  },

  // --- Public funds ---
  Q157833: {
    category: "DETOURNEMENT_FONDS_PUBLICS",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Détournement de fonds",
  },
  Q3045366: {
    category: "DETOURNEMENT_FONDS_PUBLICS",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Détournement de fonds publics",
  },
  Q3403900: {
    category: "PRISE_ILLEGALE_INTERETS",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Prise illégale d'intérêts",
  },

  // --- Misc ---
  Q97667559: {
    category: "AUTRE",
    statusP1399: "CONDAMNATION_DEFINITIVE",
    statusP1595: "MISE_EN_EXAMEN",
    label: "Conduite en état d'ivresse",
  },
};

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Map a Wikidata offense Q-ID + property to our internal category/status.
 *
 * @param qId - Wikidata entity ID (e.g. "Q852973")
 * @param property - "P1399" (convicted of) or "P1595" (charge)
 * @returns category and status for creating an Affair record
 */
export function mapWikidataOffense(
  qId: string,
  property: "P1399" | "P1595"
): { category: AffairCategory; status: AffairStatus } {
  const mapping = WIKIDATA_OFFENSE_MAP[qId];

  if (!mapping) {
    return {
      category: "AUTRE",
      status: property === "P1399" ? "CONDAMNATION_DEFINITIVE" : "MISE_EN_EXAMEN",
    };
  }

  return {
    category: mapping.category,
    status: property === "P1399" ? mapping.statusP1399 : mapping.statusP1595,
  };
}

/**
 * Get the French label for a Wikidata offense Q-ID.
 *
 * @param qId - Wikidata entity ID (e.g. "Q852973")
 * @returns French label or fallback with the Q-ID
 */
export function getOffenseLabel(qId: string): string {
  const mapping = WIKIDATA_OFFENSE_MAP[qId];
  return mapping ? mapping.label : `Infraction inconnue (${qId})`;
}
