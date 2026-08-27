import { createHash } from "node:crypto";
import { canonicalJson, hashSourceContent } from "@/lib/hash/canonical";
import { db, type DbTransactionClient } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { ProposalRisk, ProposalStatus, SourceType } from "@/generated/prisma";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import {
  AFFAIR_EVOLUTION_REVELATION_TITLE,
  affairEventAdditionSchema,
  affairEventProposalMetadataSchema,
  affairPatchSchema,
  normalizeAffairEventSourceUrl,
  parseAffairEventObservation,
  parseAffairEventProposalMetadata,
  parseAffairProposalPayload,
  PROPOSABLE_FIELDS,
  type AffairEventAddition,
  type AffairEventObservation,
  type AffairEventProposal,
  type AffairEventProposalMetadata,
  type AffairPatch,
  type ProposableField,
} from "@/lib/security/schemas/affair-proposal";
import { verifyAndAnnotateProposalOfficialEvidence } from "@/lib/affairs/official-decision-verification";
import { isVerifiedAffairPressUrl } from "@/config/affair-sources";

// Affaires v2, lot 1.
//
// Invariant: an importer never mutates an existing Affair directly. It calls
// proposeAffairUpdate(), which auto-applies only absent, non-contradictory
// machine identifiers and files everything else as a reviewable proposal.

/**
 * Importers never write an affair. Not "almost never": never (#545).
 *
 * There used to be one exception, an auto-apply path that filled the decision
 * identifiers `ecli`, `pourvoiNumber` and `caseNumbers` when they were empty, on the
 * grounds that filling a blank machine identifier needed no editorial call.
 *
 * Those identifiers moved to `CourtDecision`, written by the targeted Judilibre
 * enrichment (#337). No importer had anything left to auto-apply, so the exception
 * and its machinery are gone rather than left inert: a code path nobody can reach is
 * a code path nobody maintains.
 *
 * The `AUTO_APPLIED` and `CONFLICT` proposal statuses stay in the schema, and the
 * admin still renders them. No new row can carry them; a historical one still reads.
 */

/**
 * Changing any of these is HIGH risk regardless of the previous value.
 * Only `status` in lot 1: involvement, category and severity are not proposable
 * because no importer emits them.
 */
const HIGH_RISK_FIELDS = Object.freeze(["status"] as const);

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
  publicationStatus: true,
  status: true,
  verdictDate: true,
  court: true,
  sentence: true,
  prisonMonths: true,
  prisonFirmMonths: true,
  fineAmount: true,
  ineligibilityMonths: true,
  ineligibilityFirmMonths: true,
  communityService: true,
  otherSentence: true,
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

function normalizeRecord(record: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = normalizeForCompare(record[key]);
  }
  return out;
}

/** Re-exported so existing callers keep importing it from here. */
export { hashSourceContent };

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
  // LOW is no longer produced: it meant "only auto-applicable identifiers", and no
  // field is auto-applicable any more. The enum value stays for historical rows.
  return "MEDIUM";
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
  /** The proposal awaiting review. Always set unless the payload was a duplicate. */
  pendingProposalId: string | null;
  /** True when an identical payload had already been recorded. */
  deduped: boolean;
}

export type LiveAffair = Record<string, unknown> & {
  publicId: string | null;
  slug: string;
  title: string;
  politician?: { slug: string; fullName: string } | null;
};

const EVENT_TARGET_PUBLICATION_STATUSES = new Set(["DRAFT", "PUBLISHED"]);

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
  const verifiedEvidence = await verifyAndAnnotateProposalOfficialEvidence(input);
  const normalizedInput: ProposeAffairUpdateInput = verifiedEvidence
    ? {
        ...input,
        sourceUrl: verifiedEvidence.sourceUrl,
        sourceContentHash: input.sourceContentHash ?? verifiedEvidence.verification.contentHash,
        metadata: toJson(verifiedEvidence.metadata),
      }
    : input;

  const extractorVersion = normalizedInput.extractorVersion ?? "v1";

  const affair = await db.affair.findUnique({
    where: { id: normalizedInput.affairId },
    select: AFFAIR_PROPOSABLE_SELECT,
  });
  if (!affair) {
    throw new Error(`Affaire introuvable : ${normalizedInput.affairId}`);
  }
  const live = affair as unknown as LiveAffair;

  const reviewPatch: Record<string, unknown> = {};
  for (const field of fields) {
    reviewPatch[field] = (patch as Record<string, unknown>)[field];
  }

  const result: ProposeAffairUpdateResult = {
    pendingProposalId: null,
    deduped: false,
  };

  if (Object.keys(reviewPatch).length > 0) {
    const outcome = await recordPendingProposal(
      normalizedInput,
      extractorVersion,
      reviewPatch,
      live
    );
    result.pendingProposalId = outcome.proposalId;
    result.deduped = outcome.deduped;
  }

  return result;
}

export interface ProposeAffairEventInput {
  affairId: string;
  importer: string;
  importRunId: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: Date;
  publisher: string;
  pressArticleId?: string | null;
  resolverDecisionId?: string | null;
  sourceContentHash?: string | null;
  sourceExcerpt: string;
  confidence: number;
  rationale: string;
  extractorVersion?: string;
}

export type ProposeAffairEventOutcome =
  | "CREATED"
  | "DEDUPED_PENDING"
  | "DEDUPED_TERMINAL"
  | "ALREADY_APPLIED"
  | "TARGET_INELIGIBLE";

export interface ProposeAffairEventResult extends ProposeAffairUpdateResult {
  outcome: ProposeAffairEventOutcome;
  existingStatus?: ProposalStatus;
}

export type PreviewAffairEventProposalOutcome =
  | "WOULD_CREATE"
  | Exclude<ProposeAffairEventOutcome, "CREATED">;

export interface PreviewAffairEventProposalResult extends ProposeAffairUpdateResult {
  outcome: PreviewAffairEventProposalOutcome;
  existingStatus?: ProposalStatus;
}

export type PreviewAffairEventProposalInput = Omit<ProposeAffairEventInput, "importRunId"> & {
  importRunId?: string;
};

export function computeAffairEventIdentity(input: {
  affairId: string;
  sourceUrl: string;
  publishedAt: Date;
  pressArticleId?: string | null;
}): string {
  const sourceIdentity = input.pressArticleId
    ? { pressArticleId: input.pressArticleId }
    : { sourceUrl: normalizeAffairEventSourceUrl(input.sourceUrl) };
  return createHash("sha256")
    .update(
      canonicalJson({
        version: "press-revelation-v2",
        affairId: input.affairId,
        publishedAt: input.publishedAt.toISOString(),
        type: "REVELATION",
        sourceIdentity,
      })
    )
    .digest("hex");
}

export interface AffairEventProposalContext {
  event: AffairEventProposal;
  observation: AffairEventObservation;
  metadata: AffairEventProposalMetadata;
  normalizedSourceUrl: string;
  identityKey: string;
}

/** Single strict parser shared by the review UI and the acceptance service. */
export function parseAffairEventProposalContext(input: {
  affairId: string;
  proposedPatch: unknown;
  observedValues: unknown;
  metadata: unknown;
  source: SourceType;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
}): AffairEventProposalContext {
  const parsed = parseAffairProposalPayload(input.proposedPatch);
  if (parsed.kind !== "ADD_EVENT") throw new Error("La proposition n’ajoute pas un événement");
  const observation = parseAffairEventObservation(input.observedValues);
  const metadata = parseAffairEventProposalMetadata(input.metadata);
  const normalizedSourceUrl = input.sourceUrl
    ? normalizeAffairEventSourceUrl(input.sourceUrl)
    : null;
  if (input.source !== "PRESSE" || !normalizedSourceUrl) {
    throw new Error("Un événement importé exige une source de presse HTTP(S)");
  }
  if (!isVerifiedAffairPressUrl(normalizedSourceUrl)) {
    throw new Error("La source journalistique de l’événement n’est pas vérifiée");
  }
  if (!input.sourceExcerpt?.trim() || input.sourceExcerpt.trim().length > 500) {
    throw new Error("Un extrait vérifié est obligatoire pour cet événement");
  }
  if (parsed.event.sourceUrl !== normalizedSourceUrl) {
    throw new Error("L’URL de l’événement diffère de celle de la proposition");
  }
  if (metadata.eventProposal.publishedAt.getTime() !== parsed.event.date.getTime()) {
    throw new Error("La date de provenance diffère de celle de l’événement");
  }
  if (
    observation.addEvent.identityKey !== metadata.eventProposal.identityKey ||
    observation.addEvent.identityVersion !== metadata.eventProposal.identityVersion
  ) {
    throw new Error("L’identité observée de l’événement est incohérente");
  }
  const identityKey = computeAffairEventIdentity({
    affairId: input.affairId,
    sourceUrl: parsed.event.sourceUrl,
    publishedAt: metadata.eventProposal.publishedAt,
    pressArticleId: metadata.eventProposal.pressArticleId,
  });
  if (metadata.eventProposal.identityKey !== identityKey) {
    throw new Error("L’identité de l’événement ne correspond pas à son contenu");
  }
  return {
    event: parsed.event,
    observation,
    metadata,
    normalizedSourceUrl,
    identityKey,
  };
}

interface PreparedAffairEventProposal {
  affair: LiveAffair;
  eventPayload: AffairEventAddition;
  normalizedInput: ProposeAffairUpdateInput;
  observedValues: AffairEventObservation;
  identityKey: string;
}

type AffairEventAssessment =
  | { outcome: "WOULD_CREATE"; prepared: PreparedAffairEventProposal }
  | {
      outcome: Exclude<PreviewAffairEventProposalOutcome, "WOULD_CREATE">;
      pendingProposalId: string | null;
      deduped: boolean;
      existingStatus?: ProposalStatus;
    };

async function findAppliedAffairEvent(input: {
  affairId: string;
  identityKey: string;
  date: Date;
  sourceUrl: string;
}): Promise<{ id: string } | null> {
  const identified = await db.affairEvent.findUnique({
    where: {
      affairId_identityKey: { affairId: input.affairId, identityKey: input.identityKey },
    },
    select: { id: true },
  });
  if (identified) return identified;

  const legacyEvents = await db.affairEvent.findMany({
    where: { affairId: input.affairId, type: "REVELATION", date: input.date },
    select: { id: true, sourceUrl: true },
  });
  const canonicalSourceUrl = normalizeAffairEventSourceUrl(input.sourceUrl);
  return (
    legacyEvents.find(
      (event) =>
        event.sourceUrl !== null &&
        normalizeAffairEventSourceUrl(event.sourceUrl) === canonicalSourceUrl
    ) ?? null
  );
}

async function assessAffairEventProposal(
  input: PreviewAffairEventProposalInput
): Promise<AffairEventAssessment> {
  const sourceUrl = normalizeAffairEventSourceUrl(input.sourceUrl);
  if (!isVerifiedAffairPressUrl(sourceUrl)) {
    throw new ProposalValidationError(["sourceUrl: source journalistique non vérifiée"]);
  }
  const sourceExcerpt = input.sourceExcerpt.trim();
  if (!sourceExcerpt || sourceExcerpt.length > 500) {
    throw new ProposalValidationError([
      "sourceExcerpt: un extrait vérifié de 1 à 500 caractères est obligatoire",
    ]);
  }
  const eventPayload = affairEventAdditionSchema.parse({
    addEvent: {
      date: input.publishedAt,
      type: "REVELATION",
      title: AFFAIR_EVOLUTION_REVELATION_TITLE,
      description: null,
      sourceUrl,
      sourceTitle: input.sourceTitle,
    },
  }) as AffairEventAddition;

  const affair = await db.affair.findUnique({
    where: { id: input.affairId },
    select: AFFAIR_PROPOSABLE_SELECT,
  });
  if (!affair) throw new Error(`Affaire introuvable : ${input.affairId}`);
  if (!EVENT_TARGET_PUBLICATION_STATUSES.has(affair.publicationStatus)) {
    return { outcome: "TARGET_INELIGIBLE", pendingProposalId: null, deduped: false };
  }

  const identityKey = computeAffairEventIdentity({
    affairId: input.affairId,
    sourceUrl,
    publishedAt: eventPayload.addEvent.date,
    pressArticleId: input.pressArticleId,
  });
  const existingEvent = await findAppliedAffairEvent({
    affairId: input.affairId,
    identityKey,
    date: eventPayload.addEvent.date,
    sourceUrl,
  });
  if (existingEvent) {
    return { outcome: "ALREADY_APPLIED", pendingProposalId: null, deduped: true };
  }

  const metadata = affairEventProposalMetadataSchema.parse({
    eventProposal: {
      version: 1,
      identityVersion: "press-revelation-v2",
      identityKey,
      publisher: input.publisher,
      publishedAt: eventPayload.addEvent.date,
      pressArticleId: input.pressArticleId ?? null,
      resolverDecisionId: input.resolverDecisionId ?? null,
    },
  }) as AffairEventProposalMetadata;
  const observedValues: AffairEventObservation = {
    addEvent: {
      identityVersion: "press-revelation-v2",
      identityKey,
      existingEventId: null,
    },
  };
  const normalizedInput: ProposeAffairUpdateInput = {
    affairId: input.affairId,
    importer: input.importer,
    importRunId: input.importRunId ?? "dry-run",
    patch: eventPayload,
    source: "PRESSE",
    sourceUrl,
    sourceContentHash: input.sourceContentHash ?? null,
    sourceExcerpt,
    metadata: toJson(metadata),
    confidence: input.confidence,
    rationale: input.rationale,
    extractorVersion: input.extractorVersion,
  };
  const prepared: PreparedAffairEventProposal = {
    affair: affair as unknown as LiveAffair,
    eventPayload,
    normalizedInput,
    observedValues,
    identityKey,
  };
  const { payloadHash } = buildPendingProposalPayload({
    input: normalizedInput,
    extractorVersion: input.extractorVersion ?? "v1",
    patch: eventPayload,
    live: prepared.affair,
    observedValues,
    riskLevel: "HIGH",
  });
  const existing = await findExisting(input.affairId, input.importer, payloadHash);
  if (existing) {
    return {
      outcome: existing.status === "PENDING" ? "DEDUPED_PENDING" : "DEDUPED_TERMINAL",
      pendingProposalId: existing.id,
      deduped: true,
      existingStatus: existing.status,
    };
  }

  return { outcome: "WOULD_CREATE", prepared };
}

/** Performs every validation and deduplication lookup without writing anything. */
export async function previewAffairEventProposal(
  input: PreviewAffairEventProposalInput
): Promise<PreviewAffairEventProposalResult> {
  const assessment = await assessAffairEventProposal(input);
  if (assessment.outcome === "WOULD_CREATE") {
    return { outcome: "WOULD_CREATE", pendingProposalId: null, deduped: false };
  }
  return assessment;
}

/**
 * Files a human-reviewed proposal for a media timeline entry.
 *
 * The source article is the event: its publication date is known, while the date
 * of any procedural act mentioned by the article is not. Nothing related to the
 * target affair is written before a reviewer accepts the proposal.
 */
export async function proposeAffairEvent(
  input: ProposeAffairEventInput
): Promise<ProposeAffairEventResult> {
  const assessment = await assessAffairEventProposal(input);
  if (assessment.outcome !== "WOULD_CREATE") return assessment;
  const { prepared } = assessment;

  const recorded = await recordPendingProposal(
    prepared.normalizedInput,
    input.extractorVersion ?? "v1",
    prepared.eventPayload,
    prepared.affair,
    { observedValues: prepared.observedValues, riskLevel: "HIGH" }
  );
  const outcome = recorded.deduped
    ? recorded.status === "PENDING"
      ? "DEDUPED_PENDING"
      : "DEDUPED_TERMINAL"
    : "CREATED";

  return {
    outcome,
    pendingProposalId: recorded.proposalId,
    deduped: recorded.deduped,
    existingStatus: recorded.deduped ? recorded.status : undefined,
  };
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
  riskLevel?: ProposalRisk;
}

/**
 * Only `PENDING` remains creatable (#545). `AUTO_APPLIED` and `CONFLICT` stay in the
 * schema so a historical row still reads, but nothing produces them any more.
 */
function buildProposalData(
  args: ProposalRowArgs,
  status: "PENDING",
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
    riskLevel: args.riskLevel ?? deriveRiskLevel(Object.keys(args.patch), args.observedValues),
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
): Promise<{ id: string; status: ProposalStatus } | null> {
  return db.affairUpdateProposal.findFirst({
    where: { affairId, importer, payloadHash },
    select: { id: true, status: true },
  });
}

/**
 * Everything a PENDING proposal write needs, computed without touching the DB.
 *
 * Pure so the same payload can be written by the plain path or inside a caller's
 * transaction, with no risk of the two drifting (issue #525).
 */
export function buildPendingProposalPayload(args: {
  input: ProposeAffairUpdateInput;
  extractorVersion: string;
  patch: Record<string, unknown>;
  live: LiveAffair;
  observedValues?: Record<string, unknown>;
  riskLevel?: ProposalRisk;
}): { payloadHash: string; data: Prisma.AffairUpdateProposalUncheckedCreateInput } {
  const observedValues = args.observedValues ?? pickObserved(args.patch, args.live);
  const payloadHash = computePayloadHash({
    importer: args.input.importer,
    extractorVersion: args.extractorVersion,
    source: args.input.source,
    sourceUrl: args.input.sourceUrl,
    officialId: args.input.officialId,
    sourceContentHash: args.input.sourceContentHash,
    proposedPatch: args.patch,
    observedValues,
  });

  return {
    payloadHash,
    data: buildProposalData(
      {
        input: args.input,
        extractorVersion: args.extractorVersion,
        patch: args.patch,
        observedValues,
        snapshot: buildAffairSnapshot(args.live),
        payloadHash,
        riskLevel: args.riskLevel,
      },
      "PENDING"
    ),
  };
}

/**
 * Records a PENDING proposal on a caller-supplied transaction.
 *
 * Mirrors the plain path below, including the rule that a terminal state is never
 * resurrected: a rejected patch replayed later stays rejected.
 */
export async function recordPendingProposalInTransaction(
  tx: DbTransactionClient,
  input: ProposeAffairUpdateInput,
  patch: Record<string, unknown>,
  live: LiveAffair,
  extractorVersion = "v1"
): Promise<{ proposalId: string; deduped: boolean }> {
  const { payloadHash, data } = buildPendingProposalPayload({
    input,
    extractorVersion,
    patch,
    live,
  });

  const existing = await tx.affairUpdateProposal.findFirst({
    where: { affairId: input.affairId, importer: input.importer, payloadHash },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "PENDING") {
      await tx.affairUpdateProposal.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });
    }
    return { proposalId: existing.id, deduped: true };
  }

  const created = await tx.affairUpdateProposal.create({ data, select: { id: true } });
  return { proposalId: created.id, deduped: false };
}

async function recordPendingProposal(
  input: ProposeAffairUpdateInput,
  extractorVersion: string,
  patch: Record<string, unknown>,
  live: LiveAffair,
  options: { observedValues?: Record<string, unknown>; riskLevel?: ProposalRisk } = {}
): Promise<{ proposalId: string; deduped: boolean; status: ProposalStatus }> {
  const { payloadHash, data } = buildPendingProposalPayload({
    input,
    extractorVersion,
    patch,
    live,
    observedValues: options.observedValues,
    riskLevel: options.riskLevel,
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
    return { proposalId: existing.id, deduped: true, status: existing.status };
  }

  try {
    const created = await db.affairUpdateProposal.create({ data, select: { id: true } });
    return { proposalId: created.id, deduped: false, status: "PENDING" };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const winner = await findExisting(input.affairId, input.importer, payloadHash);
    if (!winner) throw error;
    return { proposalId: winner.id, deduped: true, status: winner.status };
  }
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return safeJsonParseOrThrow<Prisma.InputJsonValue>(JSON.stringify(value));
}
