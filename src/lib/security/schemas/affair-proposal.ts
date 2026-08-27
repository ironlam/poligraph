import { z } from "zod/v4";
import { AffairEventType, AffairStatus, Prisma } from "@/generated/prisma";
import { isValidSentenceSplit, LIFE_SENTENCE_MONTHS } from "@/lib/affairs/sentence-split";

// Affaires v2, lot 1: the strict gate between an importer-proposed JSON patch and
// Prisma. A raw `proposedPatch` is NEVER spread into db.affair.update().
//
// Enums are derived from the generated Prisma client rather than retyped, so the
// whitelist cannot drift from the database. That drift already exists elsewhere:
// `schemas/affair.ts` declares "PROCES"/"APPEL" while the enum says
// PROCES_EN_COURS/APPEL_EN_COURS, and "MODEREE"/"MINEURE" where the enum has
// SIGNIFICATIF.

/**
 * Scoped to what the two converted importers actually propose today.
 *
 * discover-affairs (Wikidata penalties): verdictDate, court, sentence,
 *   prisonMonths, prisonFirmMonths, ineligibilityMonths, communityService,
 *   otherSentence.
 * judilibre: status. Its identifiers moved to `CourtDecision` (#545).
 *
 * fineAmount is allowed but no importer emits it today: Wikidata signals a fine
 * (wikidata-penalties.ts maps Q1243001 to "fineAmount") yet the extractor reduces
 * it to a boolean `hasFine` and drops the amount. Kept in the whitelist so the
 * field is ready when the extractor is fixed.
 *
 * Deliberately NOT proposable:
 * - publicationStatus: publishing stays a human moderation act. An importer must
 *   never be able to hand an admin a one-click "publish this" button.
 * - involvement, category, severity: no importer proposes them; they change what
 *   an affair means about a person and deserve their own design.
 * - title, description: editorial prose, written by moderation.
 * - factsDate, startDate, chamber, caseNumber: no emitter. Verified: the only
 *   `chamber` producers in src/services/sync are parliamentary, not judicial.
 * - politicianId, partyAtTimeId, linkedAffairId: re-attribution is identity
 *   resolution work, handled by AffairPoliticianDecision.
 * - slug, publicId, oldSlugs: public URLs are not importer territory.
 * - ecli, pourvoiNumber, caseNumbers: decision identifiers, and a decision is not
 *   an affair (#545). They live on `CourtDecision`, reached through a link, and are
 *   written by the targeted Judilibre enrichment (#337). Proposing them on an affair
 *   would put back the "one decision, one affair" assumption the Carignon case
 *   disproved. `Affair.court`, `Affair.verdictDate` and `Affair.caseNumber` stay:
 *   they describe the editorial state of an affair, not a decision.
 *
 * Widen this list only together with the importer that needs it.
 */
const dateLike = z
  .union([z.date(), z.string().min(1)])
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Date invalide" })
  .transform((v) => new Date(v));

const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Event dates cross a JSON boundary before review. Accept Date objects from
 * importers and the exact UTC representation JSON.stringify produces, but never
 * normalize an impossible calendar date into another day.
 */
const strictInstantLike = z
  .union([z.date(), z.string().regex(ISO_INSTANT_PATTERN, "Date ISO UTC invalide")])
  .refine((value) => {
    const date = value instanceof Date ? value : new Date(value);
    return !Number.isNaN(date.getTime()) && (value instanceof Date || date.toISOString() === value);
  }, "Date invalide")
  .transform((value) => new Date(value));

function normalizeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        /^(utm_|pk_)/i.test(key) ||
        [
          "fbclid",
          "gclid",
          "dclid",
          "gbraid",
          "wbraid",
          "msclkid",
          "mc_cid",
          "mc_eid",
          "at_campaign",
          "at_medium",
          "xtor",
        ].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

const httpUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => normalizeHttpUrl(value) !== null, "URL HTTP(S) invalide")
  .transform((value) => normalizeHttpUrl(value)!);

/** Public copy is deterministic and never comes from an AI extraction. */
export const AFFAIR_EVOLUTION_REVELATION_TITLE =
  "Publication d’une nouvelle source sur l’évolution de l’affaire";

export const affairEventProposalSchema = z.strictObject({
  date: strictInstantLike,
  // Issue #763 deliberately proposes a media event, not a dated procedural act.
  type: z.enum(AffairEventType).refine((value) => value === "REVELATION", {
    message: "Seul un événement REVELATION peut être proposé par un importeur",
  }),
  title: z.literal(AFFAIR_EVOLUTION_REVELATION_TITLE),
  description: z.null().optional(),
  sourceUrl: httpUrl,
  sourceTitle: z.string().trim().min(1).max(500),
});

export const affairEventAdditionSchema = z.strictObject({
  addEvent: affairEventProposalSchema,
});

export const affairEventObservationSchema = z.strictObject({
  addEvent: z.strictObject({
    identityVersion: z.literal("press-revelation-v2"),
    identityKey: z.string().regex(/^[a-f0-9]{64}$/),
    existingEventId: z.null(),
  }),
});

export const affairEventProposalMetadataSchema = z.strictObject({
  eventProposal: z.strictObject({
    version: z.literal(1),
    identityVersion: z.literal("press-revelation-v2"),
    identityKey: z.string().regex(/^[a-f0-9]{64}$/),
    publisher: z.string().trim().min(1).max(200),
    publishedAt: strictInstantLike,
    pressArticleId: z.string().min(1).nullable().optional(),
    resolverDecisionId: z.string().min(1).nullable().optional(),
  }),
});

export type AffairEventProposal = z.infer<typeof affairEventProposalSchema>;
export type AffairEventAddition = z.infer<typeof affairEventAdditionSchema>;
export type AffairEventObservation = z.infer<typeof affairEventObservationSchema>;
export type AffairEventProposalMetadata = z.infer<typeof affairEventProposalMetadataSchema>;

export type ParsedAffairProposal =
  | { kind: "PATCH"; patch: AffairPatch }
  | { kind: "ADD_EVENT"; event: AffairEventProposal };

export function parseAffairProposalPayload(raw: unknown): ParsedAffairProposal {
  const event = affairEventAdditionSchema.safeParse(raw);
  if (event.success) return { kind: "ADD_EVENT", event: event.data.addEvent };

  const patch = affairPatchSchema.safeParse(raw);
  if (patch.success) return { kind: "PATCH", patch: patch.data };

  const issues = [...event.error.issues, ...patch.error.issues].map(
    (issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`
  );
  throw new Error(issues.join("; "));
}

export function parseAffairEventObservation(raw: unknown): AffairEventObservation {
  return affairEventObservationSchema.parse(raw);
}

export function parseAffairEventProposalMetadata(raw: unknown): AffairEventProposalMetadata {
  return affairEventProposalMetadataSchema.parse(raw);
}

export function normalizeAffairEventSourceUrl(raw: string): string {
  const normalized = normalizeHttpUrl(raw);
  if (!normalized) throw new Error("URL HTTP(S) invalide");
  return normalized;
}

/** 1200 months = 100 years. Guards against unit confusion (years passed as months). */
const monthsLike = z.number().int().min(0).max(1200);

/**
 * A prison total may carry the perpetuity sentinel; a firm part never can, since French
 * law does not suspend a life term. Reusing `monthsLike` for both would put the sentinel
 * out of reach of the schema entirely, which is what made the invariant below look
 * enforced when it was not (#576).
 */
const prisonTotalMonths = z.union([monthsLike, z.literal(LIFE_SENTENCE_MONTHS)]);

/**
 * A patch may carry one half of a pair, so the check can only fire when it holds both.
 * The other half is verified against the live row in `acceptProposal`.
 */
function splitIsCoherent(
  total: number | null | undefined,
  firm: number | null | undefined
): boolean {
  if (total === undefined || firm === undefined) return true;
  return isValidSentenceSplit(total, firm);
}

/** Accepts a string or number, normalizes through a string so no float rounding. */
const decimalLike = z
  .union([z.string().min(1), z.number()])
  .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, { message: "Montant invalide" })
  .transform((v) => new Prisma.Decimal(String(v)));

export const affairPatchSchema = z
  .strictObject({
    // Judicial state
    status: z.enum(AffairStatus).nullable().optional(),

    // Dates
    verdictDate: dateLike.nullable().optional(),

    // Jurisdiction
    court: z.string().min(1).max(300).nullable().optional(),

    // Sentence
    sentence: z.string().min(1).max(2000).nullable().optional(),
    prisonMonths: prisonTotalMonths.nullable().optional(),
    prisonFirmMonths: monthsLike.nullable().optional(),
    fineAmount: decimalLike.nullable().optional(),
    ineligibilityMonths: monthsLike.nullable().optional(),
    ineligibilityFirmMonths: monthsLike.nullable().optional(),
    communityService: z.number().int().min(0).max(10000).nullable().optional(),
    otherSentence: z.string().min(1).max(2000).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Le patch ne peut pas être vide",
  })
  .refine((patch) => splitIsCoherent(patch.prisonMonths, patch.prisonFirmMonths), {
    message: "La part ferme est incompatible avec le total de la peine",
    path: ["prisonFirmMonths"],
  })
  .refine((patch) => splitIsCoherent(patch.ineligibilityMonths, patch.ineligibilityFirmMonths), {
    message: "La part ferme est incompatible avec le total de l'inéligibilité",
    path: ["ineligibilityFirmMonths"],
  });

export type AffairPatch = z.infer<typeof affairPatchSchema>;

/** Field names the schema accepts. Keep in sync with affairPatchSchema. */
export const PROPOSABLE_FIELDS = Object.freeze([
  "status",
  "verdictDate",
  "court",
  "sentence",
  "prisonMonths",
  "prisonFirmMonths",
  "fineAmount",
  "ineligibilityMonths",
  "ineligibilityFirmMonths",
  "communityService",
  "otherSentence",
] as const);

export type ProposableField = (typeof PROPOSABLE_FIELDS)[number];

export const reviewProposalSchema = z.object({
  reviewNotes: z.string().max(2000).optional(),
});
