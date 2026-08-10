import { z } from "zod";
import { ThemeCategory } from "@/generated/prisma";

export const DOCUMENT_TYPES = [
  "CANDIDATE_PROGRAM_2027",
  "CANDIDATE_PROPOSALS_2027",
  "PARTY_PLATFORM_CURRENT",
  "PARTY_PLATFORM_HISTORICAL",
  "THEMATIC_DOCUMENT",
  "CAMPAIGN_SPEECH",
  "UNUSABLE",
] as const;

export type ProgramDocumentType = (typeof DOCUMENT_TYPES)[number];

export const extractionSchema = z.object({
  proposals: z.array(
    z.object({
      sourceText: z.string().min(1),
      normalizedText: z.string().min(1).nullable(),
      classification: z.enum([
        "MEASURE",
        "OBJECTIVE",
        "VALUE",
        "DIAGNOSIS",
        "GENERAL_INTENT",
        "AMBIGUOUS",
      ]),
      theme: z.enum(ThemeCategory).nullable(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1).max(500),
    })
  ),
});

export type ExtractedProposal = z.infer<typeof extractionSchema>["proposals"][number] & {
  page: number | null;
};

export type DocumentSegment = {
  id: string;
  heading: string | null;
  page: number | null;
  text: string;
};

export type ParsedDocument = {
  mediaType: "html" | "pdf";
  segments: DocumentSegment[];
  scannedPdf: boolean;
};
