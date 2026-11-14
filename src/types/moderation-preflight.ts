import { z } from "zod";

import { ISSUE_TYPES } from "@/services/affair-moderation";

export const AttributionConfidenceSchema = z.enum(["STRONG", "WEAK", "MISMATCH"]);
export const AttributionAuditSchema = z.object({
  confidence: AttributionConfidenceSchema,
  reasoning: z.string(),
  suggestedAlternativePoliticianId: z.string().nullable(),
});
export type AttributionAudit = z.infer<typeof AttributionAuditSchema>;

export const ModerationRecommendationSchema = z.enum(["PUBLISH", "REJECT", "NEEDS_REVIEW"]);
export type ModerationRecommendation = z.infer<typeof ModerationRecommendationSchema>;

export const ModerationIssueSchema = z.object({
  type: z.enum(ISSUE_TYPES),
  detail: z.string(),
});
export const DraftCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  publicationStatus: z.literal("DRAFT"),
  createdAt: z.string(),
  politician: z.object({
    id: z.string(),
    slug: z.string(),
    fullName: z.string(),
  }),
  category: z.string(),
  status: z.string(),
  preflight: z.object({
    moderationRecommendation: ModerationRecommendationSchema,
    moderationIssues: z.array(ModerationIssueSchema),
    correctedInvolvement: z.string().nullable(),
    attribution: AttributionAuditSchema,
    duplicateOf: z.array(z.string()),
  }),
});
export type DraftCandidate = z.infer<typeof DraftCandidateSchema>;

export const DuplicateGroupSchema = z.object({
  affairIds: z.array(z.string()),
  score: z.number(),
  matchedBy: z.string(),
  recommendedKeep: z.string(),
  autoMergeEligible: z.boolean(),
});
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

export const ModerationPreflightReportSchema = z.object({
  generatedAt: z.string(),
  ttlHours: z.literal(24),
  source: z.enum(["cron", "manual"]),
  stats: z.object({
    totalDrafts: z.number(),
    duplicateGroups: z.number(),
    attributionIssues: z.number(),
    autoPublishCandidates: z.number(),
    needsReview: z.number(),
  }),
  drafts: z.array(DraftCandidateSchema),
  duplicateGroups: z.array(DuplicateGroupSchema),
});
export type ModerationPreflightReport = z.infer<typeof ModerationPreflightReportSchema>;
