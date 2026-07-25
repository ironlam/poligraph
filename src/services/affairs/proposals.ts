import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { ProposalRisk, ProposalStatus, SourceType } from "@/generated/prisma";
import {
  affairPatchSchema,
  PROPOSABLE_FIELDS,
  type AffairPatch,
  type ProposableField,
} from "@/lib/security/schemas/affair-proposal";

// Affaires v2, lot 1.
//
// Invariant: an importer never mutates an existing Affair directly. It calls
// proposeAffairUpdate(), which auto-applies only absent, non-contradictory
// machine identifiers and files everything else as a reviewable proposal.

/** The only family an importer may write without human review. */
export const AUTO_APPLICABLE_FIELDS = Object.freeze([
  "ecli",
  "pourvoiNumber",
  "caseNumbers",
] as const);

/** Changing any of these is HIGH risk regardless of the previous value. */
const HIGH_RISK_FIELDS = Object.freeze(["status", "involvement", "category", "severity"] as const);

const AUTO_SET: ReadonlySet<string> = new Set(AUTO_APPLICABLE_FIELDS);
const HIGH_RISK_SET: ReadonlySet<string> = new Set(HIGH_RISK_FIELDS);

export class ProposalValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Patch invalide : ${issues.join("; ")}`);
    this.name = "ProposalValidationError";
  }
}

// ─── Normalization ───────────────────────────────────────────────

/**
 * Marker for an absent value in normalized comparisons.
 *
 * Not a control character: these strings reach the conflictDetail JSONB column,
 * and Postgres rejects \u0000 inside a JSON string.
 */
export const EMPTY_VALUE = "∅";

/**
 * Collapse a value to a comparable string.
 *
 * Needed because the same logical value reaches us in different shapes: Prisma
 * returns `Date` and `Prisma.Decimal`, while the JSON columns hold ISO strings
 * and decimal strings. A naive equality check would report drift on every
 * acceptance.
 */
export function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return new Prisma.Decimal(value.toString()).toFixed();
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(normalizeForCompare).sort());
  }
  if (typeof value === "object") return canonicalJson(value);
  return String(value);
}

/** Deterministic JSON: keys sorted at every depth, so hashing is stable. */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Prisma.Decimal.isDecimal(value)) return JSON.stringify(value.toString());
  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRecord(record: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = normalizeForCompare(record[key]);
  }
  return out;
}

// ─── Hashing ─────────────────────────────────────────────────────

export interface PayloadHashInput {
  importer: string;
  extractorVersion: string;
  source: SourceType;
  sourceUrl?: string | null;
  officialId?: string | null;
  proposedPatch: Record<string, unknown>;
  observedValues: Record<string, unknown>;
}

/**
 * Identity of a proposal. Every component earns its place:
 * - observedValues: a CONFLICT must become re-proposable once the affair moves.
 * - extractorVersion: a fixed extractor must be able to re-propose a value that
 *   an earlier, buggy version got rejected on.
 * - source fingerprint: two distinct decisions carrying the same value stay two
 *   proposals, so the second source is not silently dropped.
 */
export function computePayloadHash(input: PayloadHashInput): string {
  const canonical = canonicalJson({
    importer: input.importer,
    extractorVersion: input.extractorVersion,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    officialId: input.officialId ?? null,
    proposedPatch: normalizeRecord(input.proposedPatch),
    observedValues: normalizeRecord(input.observedValues),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Risk ────────────────────────────────────────────────────────

/**
 * Pure function, exported for testing.
 * HIGH when the judicial state changes or a non-empty value is overwritten,
 * LOW when only absent machine identifiers are filled, MEDIUM otherwise.
 */
export function deriveRiskLevel(
  patchKeys: readonly string[],
  observedValues: Record<string, unknown>
): ProposalRisk {
  const touchesJudicialState = patchKeys.some((k) => HIGH_RISK_SET.has(k));
  const overwrites = patchKeys.some((k) => normalizeForCompare(observedValues[k]) !== EMPTY_VALUE);
  if (touchesJudicialState || overwrites) return "HIGH";
  return patchKeys.every((k) => AUTO_SET.has(k)) ? "LOW" : "MEDIUM";
}

// ─── Drift detection ─────────────────────────────────────────────

export type ConflictDetail = Record<string, { expected: string; actual: string }>;

/** Compares each observed key against the live row. Null when nothing drifted. */
export function detectDrift(
  observedValues: Record<string, unknown>,
  liveValues: Record<string, unknown>
): ConflictDetail | null {
  const conflicts: ConflictDetail = {};
  for (const key of Object.keys(observedValues)) {
    const expected = normalizeForCompare(observedValues[key]);
    const actual = normalizeForCompare(liveValues[key]);
    if (expected !== actual) conflicts[key] = { expected, actual };
  }
  return Object.keys(conflicts).length > 0 ? conflicts : null;
}

// ─── Patch validation ────────────────────────────────────────────

/**
 * The only door between importer JSON and Prisma. Rejects unknown keys, coerces
 * dates and decimals, validates enums against the generated client.
 */
export function validatePatch(raw: unknown): AffairPatch {
  const parsed = affairPatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProposalValidationError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "patch"}: ${i.message}`)
    );
  }
  return parsed.data;
}

function patchFields(patch: AffairPatch): ProposableField[] {
  return Object.keys(patch).filter((k): k is ProposableField =>
    (PROPOSABLE_FIELDS as readonly string[]).includes(k)
  );
}

// ─── Proposal creation ───────────────────────────────────────────

export interface ProposeAffairUpdateInput {
  affairId: string;
  importer: string;
  importRunId?: string | null;
  /** Raw patch; validated here, never trusted. */
  patch: unknown;
  source: SourceType;
  sourceUrl?: string | null;
  officialId?: string | null;
  sourceExcerpt?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  confidence: number;
  /** Why this affair, why this value. Shown verbatim to the reviewer. */
  rationale: string;
  extractorVersion?: string;
}

export interface ProposeAffairUpdateResult {
  /** Machine identifiers written straight away. */
  autoApplied: ProposableField[];
  autoProposalId: string | null;
  /** Proposal awaiting review, if any field required one. */
  pendingProposalId: string | null;
  /** Set when a unique identifier already belongs to another affair. */
  conflictProposalId: string | null;
  /** True when an identical payload had already been recorded. */
  deduped: boolean;
}

/**
 * Entry point for importers. Splits the patch into what may be auto-applied and
 * what needs review, then records both halves as proposals so every automated
 * write leaves a trace.
 */
export async function proposeAffairUpdate(
  input: ProposeAffairUpdateInput
): Promise<ProposeAffairUpdateResult> {
  const patch = validatePatch(input.patch);
  const fields = patchFields(patch);
  const extractorVersion = input.extractorVersion ?? "v1";

  const affair = await db.affair.findUnique({
    where: { id: input.affairId },
    select: AFFAIR_PROPOSABLE_SELECT,
  });
  if (!affair) {
    throw new Error(`Affaire introuvable : ${input.affairId}`);
  }
  const live = affair as unknown as Record<string, unknown>;

  const autoPatch: Record<string, unknown> = {};
  const reviewPatch: Record<string, unknown> = {};
  const conflictPatch: Record<string, unknown> = {};

  for (const field of fields) {
    const proposed = (patch as Record<string, unknown>)[field];
    if (!AUTO_SET.has(field)) {
      reviewPatch[field] = proposed;
      continue;
    }

    if (field === "caseNumbers") {
      const current = Array.isArray(live.caseNumbers) ? (live.caseNumbers as string[]) : [];
      const incoming = Array.isArray(proposed) ? (proposed as string[]) : [];
      const merged = mergeCaseNumbers(current, incoming);
      // Additive only: nothing new means nothing to do.
      if (merged.length > current.length) autoPatch.caseNumbers = merged;
      continue;
    }

    const isAbsent = normalizeForCompare(live[field]) === EMPTY_VALUE;
    if (!isAbsent) {
      // Contradicts a stored identifier: that is a review decision, not a fill.
      reviewPatch[field] = proposed;
      continue;
    }
    if (proposed === null || proposed === undefined) continue;

    if (field === "ecli") {
      const taken = await db.affair.findFirst({
        where: { ecli: String(proposed), id: { not: input.affairId } },
        select: { id: true },
      });
      if (taken) {
        // "Absent" but not "non-contradictory": Affair.ecli is @unique, so a
        // blind write would raise P2002. Surface it instead.
        conflictPatch[field] = proposed;
        continue;
      }
    }
    autoPatch[field] = proposed;
  }

  const result: ProposeAffairUpdateResult = {
    autoApplied: [],
    autoProposalId: null,
    pendingProposalId: null,
    conflictProposalId: null,
    deduped: false,
  };

  if (Object.keys(autoPatch).length > 0) {
    const outcome = await recordProposal({
      input,
      extractorVersion,
      patch: autoPatch,
      live,
      status: "AUTO_APPLIED",
      applyNow: true,
    });
    result.autoApplied = Object.keys(autoPatch) as ProposableField[];
    result.autoProposalId = outcome.proposalId;
    result.deduped = result.deduped || outcome.deduped;
  }

  if (Object.keys(reviewPatch).length > 0) {
    const outcome = await recordProposal({
      input,
      extractorVersion,
      patch: reviewPatch,
      live,
      status: "PENDING",
      applyNow: false,
    });
    result.pendingProposalId = outcome.proposalId;
    result.deduped = result.deduped || outcome.deduped;
  }

  if (Object.keys(conflictPatch).length > 0) {
    const outcome = await recordProposal({
      input,
      extractorVersion,
      patch: conflictPatch,
      live,
      status: "CONFLICT",
      applyNow: false,
      conflictDetail: {
        ecli: { expected: "libre", actual: "déjà rattaché à une autre affaire" },
      },
    });
    result.conflictProposalId = outcome.proposalId;
    result.deduped = result.deduped || outcome.deduped;
  }

  return result;
}

function mergeCaseNumbers(current: string[], incoming: string[]): string[] {
  const seen = new Set(current);
  for (const value of incoming) {
    if (value) seen.add(value);
  }
  return Array.from(seen);
}

/**
 * Every field a proposal can touch, selected as a constant.
 *
 * A select object built from the patch keys at runtime makes Prisma's generated
 * types recurse ("Excessive stack depth comparing types"), so the shape stays
 * static and the caller reads only the keys it needs.
 */
export const AFFAIR_PROPOSABLE_SELECT = {
  id: true,
  slug: true,
  status: true,
  involvement: true,
  category: true,
  severity: true,
  factsDate: true,
  startDate: true,
  verdictDate: true,
  court: true,
  chamber: true,
  caseNumber: true,
  sentence: true,
  prisonMonths: true,
  prisonSuspended: true,
  fineAmount: true,
  ineligibilityMonths: true,
  communityService: true,
  otherSentence: true,
  ecli: true,
  pourvoiNumber: true,
  caseNumbers: true,
} as const;

interface RecordProposalArgs {
  input: ProposeAffairUpdateInput;
  extractorVersion: string;
  patch: Record<string, unknown>;
  live: Record<string, unknown>;
  status: ProposalStatus;
  applyNow: boolean;
  conflictDetail?: ConflictDetail;
}

async function recordProposal(
  args: RecordProposalArgs
): Promise<{ proposalId: string; deduped: boolean }> {
  const { input, extractorVersion, patch, live, status, applyNow } = args;
  const keys = Object.keys(patch);
  const observedValues: Record<string, unknown> = {};
  for (const key of keys) observedValues[key] = live[key] ?? null;

  const payloadHash = computePayloadHash({
    importer: input.importer,
    extractorVersion,
    source: input.source,
    sourceUrl: input.sourceUrl,
    officialId: input.officialId,
    proposedPatch: patch,
    observedValues,
  });

  const existing = await db.affairUpdateProposal.findUnique({
    where: {
      affairId_importer_payloadHash: {
        affairId: input.affairId,
        importer: input.importer,
        payloadHash,
      },
    },
    select: { id: true, status: true },
  });

  if (existing) {
    // Never resurrect a terminal state. A rejected patch replayed by the next
    // cron run must stay rejected instead of climbing back into the queue.
    if (existing.status === "PENDING") {
      await db.affairUpdateProposal.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });
    }
    return { proposalId: existing.id, deduped: true };
  }

  const data: Prisma.AffairUpdateProposalUncheckedCreateInput = {
    affairId: input.affairId,
    importer: input.importer,
    importRunId: input.importRunId ?? null,
    proposedPatch: toJson(patch),
    observedValues: toJson(observedValues),
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    officialId: input.officialId ?? null,
    sourceExcerpt: input.sourceExcerpt ?? null,
    metadata: input.metadata ?? undefined,
    confidence: clampConfidence(input.confidence),
    riskLevel: deriveRiskLevel(keys, observedValues),
    rationale: input.rationale,
    extractorVersion,
    payloadHash,
    status,
    conflictDetail: args.conflictDetail ? toJson(args.conflictDetail) : undefined,
    appliedAt: applyNow ? new Date() : null,
  };

  if (!applyNow) {
    const created = await db.affairUpdateProposal.create({ data, select: { id: true } });
    return { proposalId: created.id, deduped: false };
  }

  // Auto-applied: the affair write and its trace commit together.
  const created = await db.$transaction(async (tx) => {
    const row = await tx.affairUpdateProposal.create({ data, select: { id: true } });
    await tx.affair.update({
      where: { id: input.affairId },
      data: buildPrismaData(validatePatch(patch)),
    });
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: input.affairId,
        changes: toJson({
          action: "PROPOSAL_AUTO_APPLIED",
          importer: input.importer,
          extractorVersion,
          proposalId: row.id,
          before: observedValues,
          after: patch,
        }),
      },
    });
    return row;
  });

  return { proposalId: created.id, deduped: false };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Turns a validated patch into a Prisma update payload. Only whitelisted keys
 * survive validatePatch(), so this cannot widen the write surface.
 */
export function buildPrismaData(patch: AffairPatch): Prisma.AffairUpdateInput {
  return { ...patch } as Prisma.AffairUpdateInput;
}
