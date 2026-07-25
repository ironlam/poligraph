import { z } from "zod/v4";

// Issue #536 — admin management of affair ↔ decision links.
//
// No schema here creates, edits or deletes a CourtDecision: the admin surface only
// manages links to decisions that already exist. Creation and enrichment belong to
// #337, once the identity rules are settled.

const cuid = z.string().min(1).max(64);

/**
 * Free-text search over existing decisions.
 *
 * One field on purpose: the route decides how to interpret the term. An exact ECLI or
 * Judilibre id resolves to at most one row; a pourvoi number always resolves to a
 * list, because a pourvoi can produce several decisions.
 */
export const courtDecisionSearchSchema = z.object({
  q: z.string().min(2).max(120),
});

export const linkCourtDecisionSchema = z.object({
  courtDecisionId: cuid,
  notes: z.string().max(2000).optional(),
});

export const updateCourtDecisionLinkSchema = z.object({
  courtDecisionId: cuid,
  /** Null clears the note; omitted leaves it untouched. */
  notes: z.string().max(2000).nullable(),
});

export const unlinkCourtDecisionSchema = z.object({
  courtDecisionId: cuid,
  /** Explicit: removing a link is a deliberate editorial act. */
  confirmed: z.literal(true),
});

export type CourtDecisionSearchQuery = z.infer<typeof courtDecisionSearchSchema>;
export type LinkCourtDecisionBody = z.infer<typeof linkCourtDecisionSchema>;
export type UpdateCourtDecisionLinkBody = z.infer<typeof updateCourtDecisionLinkSchema>;
export type UnlinkCourtDecisionBody = z.infer<typeof unlinkCourtDecisionSchema>;
