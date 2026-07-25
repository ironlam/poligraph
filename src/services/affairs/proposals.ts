import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { ProposalRisk, SourceType } from "@/generated/prisma";
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

/**
 * Changing any of these is HIGH risk regardless of the previous value.
 * Only `status` in lot 1: involvement, category and severity are not proposable
 * because no importer emits them.
 */
const HIGH_RISK_FIELDS = Object.freeze(["status"] as const);

const AUTO_SET: ReadonlySet<string> = new Set(AUTO_APPLICABLE_FIELDS);
const HIGH_RISK_SET: ReadonlySet<string> = new Set(HIGH_RISK_FIELDS);

export class ProposalValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Patch invalide : ${issues.join("; ")}`);
    this.name = "ProposalValidationError";
  }
}

/**
 * Every field a proposal can touch, plus the identity needed for affairSnapshot.
 *
 * A select object built from the patch keys at runtime makes Prisma's generated
 * types recurse ("Excessive stack depth comparing types"), so the shape stays
 * static and callers read only the keys they need.
 */
export const AFFAIR_PROPOSABLE_SELECT = {
  id: true,
  slug: true,
  publicId: true,
  title: true,
  politician: { select: { slug: true, fullName: true } },
  status: true,
  verdictDate: true,
  court: true,
  sentence: true,
  prisonMonths: true,
  prisonSuspended: true,
  ineligibilityMonths: true,
  communityService: true,
  otherSentence: true,
  ecli: true,
  pourvoiNumber: true,
  caseNumbers: true,
} as const;

export interface AffairSnapshot {
  publicId: string | null;
  slug: string;
  title: string;
  politicianSlug: string | null;
  politicianName: string | null;
}

/** Keeps an orphaned proposal readable after its affair is deleted. */
export function buildAffairSnapshot(affair: {
  publicId: string | null;
  slug: string;
  title: string;
  politician?: { slug: string; fullName: string } | null;
}): AffairSnapshot {
  return {
    publicId: affair.publicId,
    slug: affair.slug,
    title: affair.title,
    politicianSlug: affair.politician?.slug ?? null,
    politicianName: affair.politician?.fullName ?? null,
  };
}

// ─── Normalization ───────────────────────────────────────────────

/**
 * Marker for an absent value in normalized comparisons.
 *
 * Not a control character: these strings reach the conflictDetail JSONB column,
 * and Postgres rejects U+0000 inside a JSON string.
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

/** Stable hash of a raw source payload, for sourceContentHash. */
export function hashSourceContent(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

// ─── Hashing ─────────────────────────────────────────────────────

export interface PayloadHashInput {
  importer: string;
  extractorVersion: string;
  source: SourceType;
  sourceUrl?: string | null;
  officialId?: string | null;
  sourceContentHash?: string | null;
  proposedPatch: Record<string, unknown>;
  observedValues: Record<string, unknown>;
}

/**
 * Identity of a proposal. Every component earns its place:
 * - observedValues: a CONFLICT must become re-proposable once the affair moves.
 * - extractorVersion: a fixed extractor must be able to re-propose a value that
 *   an earlier, buggy version got rejected on.
 * - sourceContentHash: a claim or decision page that changes under the same URL
 *   must be able to produce a fresh proposal.
 * - source + officialId: two distinct decisions carrying the same value stay two
 *   proposals, so the second source is not silently dropped.
 */
export function computePayloadHash(input: PayloadHashInput): string {
  const canonical = canonicalJson({
    importer: input.importer,
    extractorVersion: input.extractorVersion,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    officialId: input.officialId ?? null,
    sourceContentHash: input.sourceContentHash ?? null,
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
 * dates, validates enums against the generated client.
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

/**
 * Turns a validated patch into a Prisma update payload. Only whitelisted keys
 * survive validatePatch(), so this cannot widen the write surface.
 */
export function buildPrismaData(patch: AffairPatch): Prisma.AffairUpdateInput {
  return { ...patch } as Prisma.AffairUpdateInput;
}

// ─── Proposal creation ───────────────────────────────────────────

export interface ProposeAffairUpdateInput {
  affairId: string;
  importer: string;
  /** Mandatory: a proposal always belongs to a run. See withImportRun(). */
  importRunId: string;
  /** Raw patch; validated here, never trusted. */
  patch: unknown;
  source: SourceType;
  sourceUrl?: string | null;
  officialId?: string | null;
  /** Hash of the raw source payload. See hashSourceContent(). */
  sourceContentHash?: string | null;
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
  /** Set when an identifier is contradicted or already taken elsewhere. */
  conflictProposalId: string | null;
  /** True when an identical payload had already been recorded. */
  deduped: boolean;
}

type LiveAffair = Record<string, unknown> & {
  publicId: string | null;
  slug: string;
  title: string;
  politician?: { slug: string; fullName: string } | null;
};

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
  const live = affair as unknown as LiveAffair;

  // Classification only. The auto path recomputes eligibility inside its own
  // transaction, because the row can move between this read and the write.
  const autoCandidates: Record<string, unknown> = {};
  const reviewPatch: Record<string, unknown> = {};

  for (const field of fields) {
    const proposed = (patch as Record<string, unknown>)[field];
    if (!AUTO_SET.has(field)) {
      reviewPatch[field] = proposed;
      continue;
    }
    if (field !== "caseNumbers" && normalizeForCompare(live[field]) !== EMPTY_VALUE) {
      // Contradicts a stored identifier: that is a review decision, not a fill.
      reviewPatch[field] = proposed;
      continue;
    }
    if (proposed === null || proposed === undefined) continue;
    autoCandidates[field] = proposed;
  }

  const result: ProposeAffairUpdateResult = {
    autoApplied: [],
    autoProposalId: null,
    pendingProposalId: null,
    conflictProposalId: null,
    deduped: false,
  };

  if (Object.keys(autoCandidates).length > 0) {
    const outcome = await applyAutoCandidates(input, extractorVersion, autoCandidates, live);
    result.deduped = result.deduped || outcome.deduped;
    if (outcome.kind === "applied") {
      result.autoApplied = outcome.appliedFields;
      result.autoProposalId = outcome.proposalId;
    } else if (outcome.kind === "conflict") {
      result.conflictProposalId = outcome.proposalId;
    }
  }

  if (Object.keys(reviewPatch).length > 0) {
    const outcome = await recordPendingProposal(input, extractorVersion, reviewPatch, live);
    result.pendingProposalId = outcome.proposalId;
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

function pickObserved(
  patch: Record<string, unknown>,
  live: Record<string, unknown>
): Record<string, unknown> {
  const observed: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) observed[key] = live[key] ?? null;
  return observed;
}

interface ProposalRowArgs {
  input: ProposeAffairUpdateInput;
  extractorVersion: string;
  patch: Record<string, unknown>;
  observedValues: Record<string, unknown>;
  snapshot: AffairSnapshot;
  payloadHash: string;
}

function buildProposalData(
  args: ProposalRowArgs,
  status: "PENDING" | "AUTO_APPLIED" | "CONFLICT",
  extras: { appliedAt?: Date | null; conflictDetail?: ConflictDetail } = {}
): Prisma.AffairUpdateProposalUncheckedCreateInput {
  return {
    affairId: args.input.affairId,
    affairSnapshot: toJson(args.snapshot),
    importer: args.input.importer,
    importRunId: args.input.importRunId,
    proposedPatch: toJson(args.patch),
    observedValues: toJson(args.observedValues),
    source: args.input.source,
    sourceUrl: args.input.sourceUrl ?? null,
    officialId: args.input.officialId ?? null,
    sourceContentHash: args.input.sourceContentHash ?? null,
    sourceExcerpt: args.input.sourceExcerpt ?? null,
    metadata: args.input.metadata ?? undefined,
    confidence: clampConfidence(args.input.confidence),
    riskLevel: deriveRiskLevel(Object.keys(args.patch), args.observedValues),
    rationale: args.input.rationale,
    extractorVersion: args.extractorVersion,
    payloadHash: args.payloadHash,
    status,
    appliedAt: extras.appliedAt ?? null,
    conflictDetail: extras.conflictDetail ? toJson(extras.conflictDetail) : undefined,
  };
}

/**
 * Idempotency lookup. A findFirst rather than findUnique because affairId is
 * nullable now; the unique index still serves the query.
 */
async function findExisting(
  affairId: string,
  importer: string,
  payloadHash: string
): Promise<{ id: string; status: string } | null> {
  return db.affairUpdateProposal.findFirst({
    where: { affairId, importer, payloadHash },
    select: { id: true, status: true },
  });
}

async function recordPendingProposal(
  input: ProposeAffairUpdateInput,
  extractorVersion: string,
  patch: Record<string, unknown>,
  live: LiveAffair
): Promise<{ proposalId: string; deduped: boolean }> {
  const observedValues = pickObserved(patch, live);
  const payloadHash = computePayloadHash({
    importer: input.importer,
    extractorVersion,
    source: input.source,
    sourceUrl: input.sourceUrl,
    officialId: input.officialId,
    sourceContentHash: input.sourceContentHash,
    proposedPatch: patch,
    observedValues,
  });

  const existing = await findExisting(input.affairId, input.importer, payloadHash);
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

  const created = await db.affairUpdateProposal.create({
    data: buildProposalData(
      {
        input,
        extractorVersion,
        patch,
        observedValues,
        snapshot: buildAffairSnapshot(live),
        payloadHash,
      },
      "PENDING"
    ),
    select: { id: true },
  });
  return { proposalId: created.id, deduped: false };
}

type AutoOutcome =
  | { kind: "applied"; proposalId: string; appliedFields: ProposableField[]; deduped: boolean }
  | { kind: "conflict"; proposalId: string; deduped: boolean }
  | { kind: "skipped"; deduped: boolean };

/**
 * Auto-applies absent, non-contradictory machine identifiers.
 *
 * Eligibility is re-checked INSIDE the transaction: between the classification
 * read and this write, another run or an editor may have filled the field or
 * claimed the ECLI. Proposal row, affair write, audit entry and terminal state
 * commit together or not at all.
 */
async function applyAutoCandidates(
  input: ProposeAffairUpdateInput,
  extractorVersion: string,
  candidates: Record<string, unknown>,
  liveAtRead: LiveAffair
): Promise<AutoOutcome> {
  const payloadHash = computePayloadHash({
    importer: input.importer,
    extractorVersion,
    source: input.source,
    sourceUrl: input.sourceUrl,
    officialId: input.officialId,
    sourceContentHash: input.sourceContentHash,
    proposedPatch: candidates,
    observedValues: pickObserved(candidates, liveAtRead),
  });

  const existing = await findExisting(input.affairId, input.importer, payloadHash);
  if (existing) return { kind: "skipped", deduped: true };

  return db.$transaction(async (tx) => {
    const live = (await tx.affair.findUnique({
      where: { id: input.affairId },
      select: AFFAIR_PROPOSABLE_SELECT,
    })) as unknown as LiveAffair | null;
    if (!live) return { kind: "skipped" as const, deduped: false };

    const writePatch: Record<string, unknown> = {};
    const conflicts: ConflictDetail = {};

    for (const [field, proposed] of Object.entries(candidates)) {
      if (field === "caseNumbers") {
        const current = Array.isArray(live.caseNumbers) ? (live.caseNumbers as string[]) : [];
        const merged = mergeCaseNumbers(current, Array.isArray(proposed) ? proposed : []);
        // Additive only: nothing new means nothing to do.
        if (merged.length > current.length) writePatch.caseNumbers = merged;
        continue;
      }

      const actual = normalizeForCompare(live[field]);
      if (actual !== EMPTY_VALUE) {
        conflicts[field] = { expected: EMPTY_VALUE, actual };
        continue;
      }

      if (field === "ecli") {
        const taken = await tx.affair.findFirst({
          where: { ecli: String(proposed), id: { not: input.affairId } },
          select: { id: true },
        });
        if (taken) {
          // "Absent" but not "non-contradictory": Affair.ecli is @unique, so a
          // blind write would raise P2002. Surface it instead.
          conflicts[field] = { expected: EMPTY_VALUE, actual: "déjà rattaché à une autre affaire" };
          continue;
        }
      }

      writePatch[field] = proposed;
    }

    const rowArgs: ProposalRowArgs = {
      input,
      extractorVersion,
      patch: candidates,
      observedValues: pickObserved(candidates, live),
      snapshot: buildAffairSnapshot(live),
      payloadHash,
    };

    if (Object.keys(conflicts).length > 0) {
      const row = await tx.affairUpdateProposal.create({
        data: buildProposalData(rowArgs, "CONFLICT", { conflictDetail: conflicts }),
        select: { id: true },
      });
      return { kind: "conflict" as const, proposalId: row.id, deduped: false };
    }

    if (Object.keys(writePatch).length === 0) {
      return { kind: "skipped" as const, deduped: false };
    }

    const row = await tx.affairUpdateProposal.create({
      data: buildProposalData({ ...rowArgs, patch: writePatch }, "AUTO_APPLIED", {
        appliedAt: new Date(),
      }),
      select: { id: true },
    });

    await tx.affair.update({
      where: { id: input.affairId },
      data: buildPrismaData(validatePatch(writePatch)),
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
          before: pickObserved(writePatch, live),
          after: writePatch,
        }),
      },
    });

    return {
      kind: "applied" as const,
      proposalId: row.id,
      appliedFields: Object.keys(writePatch) as ProposableField[],
      deduped: false,
    };
  });
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
