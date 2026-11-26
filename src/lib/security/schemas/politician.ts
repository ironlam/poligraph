import { z } from "zod/v4";

export const updatePoliticianSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  slug: z.string().optional(),
  civility: z.enum(["M.", "Mme"]).nullable().optional(),
  birthDate: z.string().nullable().optional(),
  deathDate: z.string().nullable().optional(),
  birthPlace: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  photoSource: z.string().nullable().optional(),
  biography: z.string().nullable().optional(),
  profession: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  publicationStatus: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED", "EXCLUDED", "REJECTED"]).optional(),
  currentPartyId: z.string().nullable().optional(),
  externalIds: z
    .array(
      z.object({
        id: z.string().optional(),
        source: z.string().min(1),
        externalId: z.string().min(1),
        url: z.string().nullable().optional(),
      })
    )
    .optional(),
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Creating a profile by hand. No status, no party, no biography: a new profile is always a
 * DRAFT, and what is unknown stays unknown.
 */
export const createPoliticianSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  civility: z.enum(["M.", "Mme"]).nullable().optional(),
  birthDate: z.string().regex(DAY).nullable().optional(),
  birthPlace: z.string().trim().max(200).nullable().optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(120)
    .optional(),
  /** The namesakes the admin was shown before confirming. Required, even when empty. */
  acknowledgedHomonymIds: z.array(z.string().min(1).max(64)).max(100),
});
