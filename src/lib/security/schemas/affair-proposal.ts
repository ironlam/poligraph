import { z } from "zod/v4";
import {
  AffairCategory,
  AffairSeverity,
  AffairStatus,
  Involvement,
  Prisma,
} from "@/generated/prisma";

// Affaires v2, lot 1: the strict gate between an importer-proposed JSON patch and
// Prisma. A raw `proposedPatch` is NEVER spread into db.affair.update().
//
// Enums are derived from the generated Prisma client rather than retyped, so the
// whitelist cannot drift from the database. That drift already exists elsewhere:
// `schemas/affair.ts` declares "PROCES"/"APPEL" while the enum says
// PROCES_EN_COURS/APPEL_EN_COURS.

/**
 * Fields an importer may propose. Deliberately narrower than the Affair model.
 *
 * Excluded, and why:
 * - publicationStatus: publishing stays a human moderation act. An importer must
 *   never be able to hand an admin a one-click "publish this" button.
 * - politicianId, partyAtTimeId, linkedAffairId: re-attribution is identity
 *   resolution work, handled by AffairPoliticianDecision.
 * - slug, publicId, oldSlugs: public URLs are not importer territory.
 * - title, description: editorial prose, written by moderation.
 * - verifiedAt, verifiedBy, isSlapp, confidenceScore: moderation metadata.
 */
const dateLike = z
  .union([z.date(), z.string().min(1)])
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Date invalide" })
  .transform((v) => new Date(v));

/** Accepts a string or number, normalizes through a string so no float rounding. */
const decimalLike = z
  .union([z.string().min(1), z.number()])
  .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, {
    message: "Montant invalide",
  })
  .transform((v) => new Prisma.Decimal(String(v)));

/** 1200 months = 100 years. Guards against unit confusion (years passed as months). */
const monthsLike = z.number().int().min(0).max(1200);

export const affairPatchSchema = z
  .strictObject({
    // Judicial state
    status: z.enum(AffairStatus).nullable().optional(),
    involvement: z.enum(Involvement).nullable().optional(),
    category: z.enum(AffairCategory).nullable().optional(),
    severity: z.enum(AffairSeverity).nullable().optional(),

    // Dates
    factsDate: dateLike.nullable().optional(),
    startDate: dateLike.nullable().optional(),
    verdictDate: dateLike.nullable().optional(),

    // Jurisdiction
    court: z.string().min(1).max(300).nullable().optional(),
    chamber: z.string().min(1).max(300).nullable().optional(),
    caseNumber: z.string().min(1).max(120).nullable().optional(),

    // Sentence
    sentence: z.string().min(1).max(2000).nullable().optional(),
    prisonMonths: monthsLike.nullable().optional(),
    prisonSuspended: z.boolean().nullable().optional(),
    fineAmount: decimalLike.nullable().optional(),
    ineligibilityMonths: monthsLike.nullable().optional(),
    communityService: z.number().int().min(0).max(10000).nullable().optional(),
    otherSentence: z.string().min(1).max(2000).nullable().optional(),

    // Machine identifiers (the only auto-applicable family)
    ecli: z.string().min(1).max(120).nullable().optional(),
    pourvoiNumber: z.string().min(1).max(120).nullable().optional(),
    caseNumbers: z.array(z.string().min(1).max(120)).max(50).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Le patch ne peut pas être vide",
  });

export type AffairPatch = z.infer<typeof affairPatchSchema>;

/** Field names the schema accepts. Used to validate observedValues key sets. */
export const PROPOSABLE_FIELDS = Object.freeze([
  "status",
  "involvement",
  "category",
  "severity",
  "factsDate",
  "startDate",
  "verdictDate",
  "court",
  "chamber",
  "caseNumber",
  "sentence",
  "prisonMonths",
  "prisonSuspended",
  "fineAmount",
  "ineligibilityMonths",
  "communityService",
  "otherSentence",
  "ecli",
  "pourvoiNumber",
  "caseNumbers",
] as const);

export type ProposableField = (typeof PROPOSABLE_FIELDS)[number];

export const reviewProposalSchema = z.object({
  reviewNotes: z.string().max(2000).optional(),
});
