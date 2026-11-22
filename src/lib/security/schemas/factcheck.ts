import { z } from "zod/v4";
import { SCRUTIN_THEMES } from "@/config/scrutin-themes";

const VALID_RATINGS = [
  "TRUE",
  "MOSTLY_TRUE",
  "HALF_TRUE",
  "MISLEADING",
  "OUT_OF_CONTEXT",
  "MOSTLY_FALSE",
  "FALSE",
  "UNVERIFIABLE",
] as const;

const VALID_STATUSES = ["PUBLISHED", "DRAFT", "ARCHIVED", "EXCLUDED", "REJECTED"] as const;

export const updateFactcheckSchema = z.object({
  publicationStatus: z.enum(VALID_STATUSES).optional(),
  verdictRating: z.enum(VALID_RATINGS).optional(),
});

export const addFactcheckMentionSchema = z.object({
  politicianId: z.string().min(1),
  isClaimant: z.boolean().default(false),
});

export const updateMentionSchema = z.object({
  isClaimant: z.boolean(),
});

/** Theme validated in the admin: one of the scrutin themes, or null for "no theme". */
export const validateFactcheckThemeSchema = z.object({
  theme: z.enum(SCRUTIN_THEMES).nullable(),
});
