import type { ExtractedProposal, ProgramDocumentType } from "./types";

export function classifyEdition(
  ownerType: "PARTY" | "CANDIDACY",
  label: string
): ProgramDocumentType {
  if (ownerType === "PARTY") {
    return /édition 20(?:1|2)[0-5]|histor/i.test(label)
      ? "PARTY_PLATFORM_HISTORICAL"
      : "PARTY_PLATFORM_CURRENT";
  }
  return /programme|projet/i.test(label) ? "CANDIDATE_PROGRAM_2027" : "CANDIDATE_PROPOSALS_2027";
}

export function isAcceptedProposal(proposal: ExtractedProposal): boolean {
  return (
    (proposal.classification === "MEASURE" || proposal.classification === "OBJECTIVE") &&
    proposal.theme !== null &&
    proposal.normalizedText !== null &&
    proposal.confidence >= 0.75
  );
}
