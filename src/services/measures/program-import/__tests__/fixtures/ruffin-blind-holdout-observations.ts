import type { AcceptanceGuard } from "../../policy";
import type { ExtractedProposal } from "../../types";

export type RuffinBlindHoldoutObservation = {
  id: string;
  modelClassification: ExtractedProposal["classification"];
  classification: ExtractedProposal["classification"];
  accepted: boolean;
  extractionGuard: ExtractedProposal["extractionGuard"];
  acceptanceGuard: AcceptanceGuard | null;
  preciseInformationAdded: boolean;
};

// Résultats révélés une seule fois depuis le rapport canonique le 16 août 2026.
// Cette fixture fige le résultat observé sans modifier les annotations humaines préalables.
const rows = [
  ["blind-1", "MEASURE", "MEASURE", true, null],
  ["blind-2", "MEASURE", "MEASURE", true, null],
  ["blind-3", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-4", "MEASURE", "MEASURE", true, null],
  ["blind-5", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-6", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-7", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-8", "MEASURE", "MEASURE", true, null],
  ["blind-9", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-10", "GENERAL_INTENT", "AMBIGUOUS", false, "UNGROUNDED_SOURCE_TEXT"],
  ["blind-11", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-12", "GENERAL_INTENT", "GENERAL_INTENT", false, null],
  ["blind-13", "GENERAL_INTENT", "GENERAL_INTENT", false, null],
  ["blind-14", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-15", "GENERAL_INTENT", "GENERAL_INTENT", false, null],
  ["blind-16", "DIAGNOSIS", "AMBIGUOUS", false, "UNGROUNDED_SOURCE_TEXT"],
  ["blind-17", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-18", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-19", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-20", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-21", "MEASURE", "MEASURE", true, null],
  ["blind-22", "MEASURE", "MEASURE", true, null],
  ["blind-23", "MEASURE", "MEASURE", true, null],
  ["blind-24", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-25", "MEASURE", "MEASURE", true, null],
  ["blind-26", "MEASURE", "MEASURE", true, null],
  ["blind-27", "MEASURE", "MEASURE", true, null],
  ["blind-28", "MEASURE", "MEASURE", true, null],
  ["blind-29", "MEASURE", "MEASURE", true, null],
  ["blind-30", "MEASURE", "MEASURE", true, null],
  ["blind-31", "MEASURE", "MEASURE", true, null],
  ["blind-32", "MEASURE", "MEASURE", true, null],
  ["blind-33", "MEASURE", "MEASURE", true, null],
  ["blind-34", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-35", "MEASURE", "MEASURE", true, null],
  ["blind-36", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-37", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-38", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-39", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-40", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-41", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-42", "MEASURE", "MEASURE", true, null],
  ["blind-43", "MEASURE", "MEASURE", true, null],
  ["blind-44", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-45", "MEASURE", "MEASURE", true, null],
  ["blind-46", "MEASURE", "MEASURE", true, null],
  ["blind-47", "OBJECTIVE", "OBJECTIVE", true, null],
  ["blind-48", "MEASURE", "MEASURE", true, null],
  ["blind-49", "MEASURE", "MEASURE", true, null],
  ["blind-50", "MEASURE", "MEASURE", true, null],
  ["blind-51", "MEASURE", "MEASURE", true, null],
  ["blind-52", "MEASURE", "MEASURE", true, null],
  ["blind-53", "MEASURE", "MEASURE", true, null],
  ["blind-54", "MEASURE", "MEASURE", true, null],
  ["blind-55", "MEASURE", "MEASURE", true, null],
  ["blind-56", "DIAGNOSIS", "DIAGNOSIS", false, null],
  ["blind-57", "VALUE", "VALUE", false, null],
  ["blind-58", "AMBIGUOUS", "AMBIGUOUS", false, null],
  ["blind-59", "GENERAL_INTENT", "GENERAL_INTENT", false, null],
  ["blind-60", "DIAGNOSIS", "AMBIGUOUS", false, "UNGROUNDED_SOURCE_TEXT"],
] as const;

export const RUFFIN_BLIND_HOLDOUT_OBSERVATIONS: RuffinBlindHoldoutObservation[] = rows.map(
  ([id, modelClassification, classification, accepted, extractionGuard]) => ({
    id,
    modelClassification,
    classification,
    accepted,
    extractionGuard,
    acceptanceGuard: accepted ? null : "NON_ACTION_CLASSIFICATION",
    preciseInformationAdded: false,
  })
);
