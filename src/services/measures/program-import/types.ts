import { z } from "zod";
import type { ThemeCategory } from "@/generated/prisma";

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
      // Keep the extractor boundary tolerant: an unknown theme must not discard an
      // otherwise valid segment. It is normalized to null by extractor.ts and reported.
      theme: z.string().min(1).nullable(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1).max(500),
    })
  ),
});

export type RawExtractedProposal = z.infer<typeof extractionSchema>["proposals"][number];

export type ExtractedProposal = Omit<RawExtractedProposal, "theme"> & {
  theme: ThemeCategory | null;
  page: number | null;
  segmentId: string;
  warnings: string[];
  normalization: "MODEL" | "SOURCE_FALLBACK" | "NONE";
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
