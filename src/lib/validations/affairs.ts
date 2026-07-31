import { z } from "zod";
import { isValidSentenceSplit } from "@/lib/affairs/sentence-split";
import { VALID_STATUSES } from "@/lib/security/schemas/affair";

// Derived, never re-typed: a hand-copied duplicate had no guard and would drift.
const AFFAIR_STATUSES = VALID_STATUSES;

const AFFAIR_CATEGORIES = [
  "CORRUPTION",
  "CORRUPTION_PASSIVE",
  "TRAFIC_INFLUENCE",
  "PRISE_ILLEGALE_INTERETS",
  "FAVORITISME",
  "DETOURNEMENT_FONDS_PUBLICS",
  "FRAUDE_FISCALE",
  "BLANCHIMENT",
  "ABUS_BIENS_SOCIAUX",
  "ABUS_CONFIANCE",
  "EMPLOI_FICTIF",
  "FINANCEMENT_ILLEGAL_CAMPAGNE",
  "FINANCEMENT_ILLEGAL_PARTI",
  "HARCELEMENT_MORAL",
  "HARCELEMENT_SEXUEL",
  "AGRESSION_SEXUELLE",
  "VIOLENCE",
  "MENACE",
  "DIFFAMATION",
  "INJURE",
  "INCITATION_HAINE",
  "FAUX_ET_USAGE_FAUX",
  "RECEL",
  "CONFLIT_INTERETS",
  "AUTRE",
] as const;

const INVOLVEMENTS = ["DIRECT", "INDIRECT", "MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const;

const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "REJECTED", "ARCHIVED", "EXCLUDED"] as const;

const SOURCE_TYPES = [
  "WIKIDATA",
  "JUDILIBRE",
  "LEGIFRANCE",
  "PRESSE",
  "WIKIPEDIA",
  "MANUAL",
] as const;

// ─── Shared sub-schemas ────────────────────────────────────────────────

const sourceInputSchema = z.object({
  id: z.string().optional(),
  url: z.string().url(),
  title: z.string().min(1),
  publisher: z.string().min(1),
  publishedAt: z.string().min(1),
  excerpt: z.string().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
});

// ─── Affair creation ───────────────────────────────────────────────────

const createAffairFields = z.object({
  politicianId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(AFFAIR_STATUSES),
  category: z.enum(AFFAIR_CATEGORIES),
  involvement: z.enum(INVOLVEMENTS).optional(),
  isRelatedToMandate: z.boolean().optional(),
  publicationStatus: z.enum(PUBLICATION_STATUSES).optional(),
  factsDate: z.string().optional(),
  startDate: z.string().optional(),
  verdictDate: z.string().optional(),
  sentence: z.string().optional(),
  appeal: z.boolean().optional(),
  // Detailed sentence
  prisonMonths: z.number().int().nonnegative().optional(),
  prisonFirmMonths: z.number().int().nonnegative().nullable().optional(),
  fineAmount: z.number().nonnegative().optional(),
  ineligibilityMonths: z.number().int().nonnegative().optional(),
  ineligibilityFirmMonths: z.number().int().nonnegative().nullable().optional(),
  communityService: z.number().int().nonnegative().optional(),
  otherSentence: z.string().optional(),
  // Jurisdiction
  court: z.string().optional(),
  chamber: z.string().optional(),
  caseNumber: z.string().optional(),
  // Judicial identifiers
  ecli: z.string().optional(),
  pourvoiNumber: z.string().optional(),
  caseNumbers: z.array(z.string()).optional(),
  // Cross-reference
  linkedAffairId: z.string().nullable().optional(),
  // Sources (at least one required)
  sources: z.array(sourceInputSchema).min(1, "Au moins une source est requise"),
});

/**
 * This is the only write path with no month ceiling, so it is the only one where the
 * perpetuity sentinel (9999) can be entered, and therefore the only one where the
 * "a life term carries no firm part" invariant can actually fire (#576).
 */
export const createAffairSchema = createAffairFields
  .refine(
    (data) => isValidSentenceSplit(data.prisonMonths ?? null, data.prisonFirmMonths ?? null),
    {
      message: "La part ferme est incompatible avec le total de la peine",
      path: ["prisonFirmMonths"],
    }
  )
  .refine(
    (data) =>
      isValidSentenceSplit(data.ineligibilityMonths ?? null, data.ineligibilityFirmMonths ?? null),
    {
      message: "La part ferme est incompatible avec le total de l'inéligibilité",
      path: ["ineligibilityFirmMonths"],
    }
  );

export type CreateAffairInput = z.infer<typeof createAffairSchema>;

// ─── Affair update (same shape as create) ──────────────────────────────

export const updateAffairSchema = createAffairSchema;

export type UpdateAffairInput = z.infer<typeof updateAffairSchema>;

// ─── Bulk action ───────────────────────────────────────────────────────

export const bulkAffairActionSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1),
    action: z.enum(["publish", "reject", "delete"]),
    rejectionReason: z.string().optional(),
  })
  .refine(
    (data) => data.action !== "reject" || (data.rejectionReason && data.rejectionReason.length > 0),
    { message: "Motif de rejet requis", path: ["rejectionReason"] }
  );

export type BulkAffairActionInput = z.infer<typeof bulkAffairActionSchema>;

// ─── Apply AI moderation ──────────────────────────────────────────

export const applyModerationSchema = z.object({
  reviewIds: z.array(z.string().min(1)).min(1),
  action: z.enum(["apply", "dismiss"]),
});

export type ApplyModerationInput = z.infer<typeof applyModerationSchema>;

// ─── Enrich affair via web search ────────────────────────────────

export const enrichAffairSchema = z.object({
  affairId: z.string().min(1),
});
