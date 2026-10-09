import { z } from "zod/v4";
import { SELECTABLE_TAGS } from "@/lib/cache-tags";

// The cap only bounds what reaches verifyPassword; it says nothing about password policy.
export const loginSchema = z.object({
  password: z.string().min(1).max(1024),
});

/** Profile pages and the government section only: nothing broader may be revalidated by path. */
export const REVALIDATE_PATH_PATTERN =
  /^\/politiques\/(?:[a-z0-9-]+|gouvernements(?:\/[a-z0-9-]+)?)$/;

export const revalidatePathsSchema = z
  .array(z.string().regex(REVALIDATE_PATH_PATTERN))
  .min(1)
  .max(10);

export const revalidateCacheSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ tags: z.array(z.enum(SELECTABLE_TAGS)).min(1) }),
]);

// Cap at 200: this endpoint revalidates paths inline in the request, so an
// unbounded batch would mean an unbounded number of revalidatePath calls.
export const revalidateVotesSchema = z.object({
  scrutinIds: z.array(z.string().min(1)).min(1).max(200),
});

export const createSyncSchema = z.object({
  script: z.string().min(1).max(200),
});

export const resolveIdentitySchema = z.object({
  judgement: z.enum(["SAME", "NOT_SAME"]),
  politicianId: z.string().optional(),
});

export const deleteRejectionsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const recoverRejectionSchema = z.object({
  rejectionId: z.string().min(1),
});

export const syncPoliticianSchema = z.object({
  type: z.enum(["factchecks", "press", "judilibre"]),
});
