import type { ExtractedProposal, ProgramDocumentType } from "./types";

export function classifyEdition(
  ownerType: "PARTY" | "CANDIDACY",
  label: string,
  documentText = ""
): ProgramDocumentType {
  if (ownerType === "PARTY") {
    return /édition 20(?:1|2)[0-5]|histor/i.test(label)
      ? "PARTY_PLATFORM_HISTORICAL"
      : "PARTY_PLATFORM_CURRENT";
  }
  if (
    /programme officiel[^.]{0,100}(?:arrive|sera (?:publié|dévoilé)|prochainement)/i.test(
      documentText
    )
  ) {
    return "CANDIDATE_PROPOSALS_2027";
  }
  const positiveProgramEvidence =
    /programme (?:présidentiel|officiel)[^.]{0,120}(?:présidentielle|2027)/i.test(documentText) ||
    /(?:présidentielle|2027)[^.]{0,120}programme (?:présidentiel|officiel)/i.test(documentText);
  return positiveProgramEvidence ? "CANDIDATE_PROGRAM_2027" : "CANDIDATE_PROPOSALS_2027";
}

export function isAcceptedProposal(proposal: ExtractedProposal): boolean {
  return (
    (proposal.classification === "MEASURE" || proposal.classification === "OBJECTIVE") &&
    proposal.theme !== null &&
    proposal.normalizedText !== null &&
    proposal.confidence >= 0.75
  );
}
