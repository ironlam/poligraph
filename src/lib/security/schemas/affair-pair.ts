import { z } from "zod/v4";
import { AffairPairClassification } from "@/generated/prisma";

// Issue #525 — the review queue. Classifications are derived from the generated
// Prisma enum rather than retyped, so the API cannot drift from the database.

const affairId = z.string().min(1).max(64);

/** Rulings the plain decision endpoint accepts. */
const REVIEW_ONLY = ["LINKED", "DISTINCT", "UNCERTAIN"] as const;

export const pairDecisionSchema = z.object({
  affairIdA: affairId,
  affairIdB: affairId,
  // DUPLICATE is absent on purpose: it authorises a merge, which is a structural
  // operation with its own endpoint, never a classification write alone.
  classification: z.enum(REVIEW_ONLY),
  notes: z.string().max(2000).optional(),
  signal: z.object({
    confidence: z.string().min(1).max(20),
    matchedBy: z.string().min(1).max(60),
    score: z.number().min(0).max(1),
  }),
});

export const pairMergeSchema = z.object({
  /** Survivor. The endpoint refuses to delete a published affair. */
  keepId: affairId,
  removeId: affairId,
  notes: z.string().max(2000).optional(),
  signal: z.object({
    confidence: z.string().min(1).max(20),
    matchedBy: z.string().min(1).max(60),
    score: z.number().min(0).max(1),
  }),
});

export const pairLinkSchema = z.object({
  /** The affair that will carry linkedAffairId. */
  fromAffairId: affairId,
  toAffairId: affairId,
  /** Explicit: publishing the link is visible on published pages. */
  confirmed: z.literal(true),
});

export type PairDecisionBody = z.infer<typeof pairDecisionSchema>;
export type PairMergeBody = z.infer<typeof pairMergeSchema>;
export type PairLinkBody = z.infer<typeof pairLinkSchema>;
export { AffairPairClassification };
