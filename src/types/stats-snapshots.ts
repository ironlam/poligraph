import { z } from "zod";

/**
 * Type-safe schemas for known StatsSnapshot.key values.
 * Each entry maps a key to its Zod parser. Use `parseSnapshot()` at read time
 * to validate the JSON shape and get a typed result.
 */

// ─── municipales-2026-parite-outliers ─────────────────────
export const ParityListRowSchema = z.object({
  listName: z.string(),
  communeId: z.string(),
  communeName: z.string(),
  departmentCode: z.string(),
  femaleRate: z.number(),
  candidateCount: z.number().int(),
});
export type ParityListRow = z.infer<typeof ParityListRowSchema>;

export const ParityOutliersSchema = z.object({
  best: z.array(ParityListRowSchema),
  worst: z.array(ParityListRowSchema),
});
export type ParityOutliers = z.infer<typeof ParityOutliersSchema>;

// ─── municipales-2026-parite-by-bracket ───────────────────
export const ParityBracketRowSchema = z.object({
  bracket: z.string(),
  femaleRate: z.number(),
  femaleCount: z.number().int(),
  maleCount: z.number().int(),
  totalCount: z.number().int(),
});
export type ParityBracketRow = z.infer<typeof ParityBracketRowSchema>;
export const ParityBySizeSchema = z.array(ParityBracketRowSchema);
export type ParityBySize = z.infer<typeof ParityBySizeSchema>;

// ─── municipales-2026-dept-party-counts ───────────────────
export const DeptPartyRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  parties: z.array(z.object({ label: z.string(), listCount: z.number().int() })),
  totalLists: z.number().int(),
  dominantParty: z.string().nullable(),
});
export type DeptPartyRow = z.infer<typeof DeptPartyRowSchema>;
export const DeptPartyDataSchema = z.array(DeptPartyRowSchema);
export type DeptPartyData = z.infer<typeof DeptPartyDataSchema>;

// ─── senatoriales-2026-outgoing-composition ───────────────
/**
 * The Senate as it stood before the 27 September 2026 ballot.
 *
 * Unlike every other snapshot here, this one is not a cache: it is the only record of
 * a state that stops existing. All reads of the Senate go through `Mandate` with
 * `isCurrent = true`, so the first `sync:senat` after the ballot replaces the 178
 * outgoing senators with the incoming ones, and nothing can reconstruct what was.
 *
 * It is therefore written once and never recomputed. Seats are stored individually
 * rather than pre-aggregated: the post-ballot comparison (re-elected, newcomers,
 * share of women) needs to join seat by seat, and aggregates cannot be un-summed.
 */
export const OutgoingSenateSeatSchema = z.object({
  politicianId: z.string(),
  /** Name as captured, so the record survives a later rename or merge. */
  fullName: z.string(),
  slug: z.string(),
  departmentCode: z.string().nullable(),
  constituency: z.string().nullable(),
  series: z.number().int(),
  /** `ParliamentaryGroup.code`, the stable identity a display name does not give. */
  groupCode: z.string().nullable(),
  groupName: z.string().nullable(),
  groupShortName: z.string().nullable(),
});
export type OutgoingSenateSeat = z.infer<typeof OutgoingSenateSeatSchema>;

export const OutgoingSenateGroupSchema = z.object({
  groupCode: z.string(),
  groupName: z.string(),
  shortName: z.string().nullable(),
  held: z.number().int(),
  atStake: z.number().int(),
});
export type OutgoingSenateGroup = z.infer<typeof OutgoingSenateGroupSchema>;

export const OutgoingSenateCompositionSchema = z.object({
  capturedAt: z.string(),
  /** Total sitting senators at capture time, both series. */
  totalSeats: z.number().int(),
  /** Seats of the renewed series, which the ballot puts back in play. */
  seatsAtStake: z.number().int(),
  seats: z.array(OutgoingSenateSeatSchema),
  groups: z.array(OutgoingSenateGroupSchema),
});
export type OutgoingSenateComposition = z.infer<typeof OutgoingSenateCompositionSchema>;

// ─── Key registry ─────────────────────────────────────────
export const MUNICIPALES_SNAPSHOT_KEYS = {
  parityOutliers: "municipales-2026-parite-outliers",
  parityBySize: "municipales-2026-parite-by-bracket",
  deptParty: "municipales-2026-dept-party-counts",
} as const;

export type MunicipalesSnapshotKey =
  (typeof MUNICIPALES_SNAPSHOT_KEYS)[keyof typeof MUNICIPALES_SNAPSHOT_KEYS];

/**
 * Write-once key. `scripts/capture-senate-composition.ts` refuses to run if a row
 * already carries it, so a second capture cannot overwrite the first.
 */
export const SENATE_OUTGOING_COMPOSITION_KEY = "senatoriales-2026-outgoing-composition";

/**
 * Parse a `StatsSnapshot.data` JSON value with the right schema.
 * Throws if the shape is wrong (which should never happen, but if it does
 * we want a loud error rather than silent corruption).
 */
export function parseSnapshot<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
