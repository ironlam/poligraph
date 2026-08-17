import { db } from "@/lib/db";
import { Judgement, MatchMethod, Prisma } from "@/generated/prisma";
import { normalizeText } from "@/lib/name-matching";
import {
  ResolveInput,
  ResolveResult,
  CandidateMatch,
  ScoringInput,
  CachedPolitician,
  BatchResolveInput,
  BatchResolveResult,
  IDENTITY_THRESHOLDS,
} from "./types";
import { BirthdateSignal } from "./signals/birthdate";
import { DepartmentSignal } from "./signals/department";
import { FirstNameSignal } from "./signals/first-name";
import { GenderSignal } from "./signals/gender";
import { NameFrequencySignal } from "./signals/name-frequency";
import { TemporalSignal } from "./signals/temporal";
import { PartyContextSignal } from "./signals/party-context";
import { LegacyCombiner } from "./combiner";
import { FellegiSunterCombiner } from "./fellegi-sunter-combiner";
import { NameFrequencyCache } from "./frequency";
import { getDefaultAdapter } from "./adapters/registry";
import type {
  SignalScoringInput,
  SignalCandidateRecord,
  SignalScoringContext,
} from "./signals/types";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

// Signal instances (stateless, reusable)
const birthdateSignal = new BirthdateSignal();
const departmentSignal = new DepartmentSignal();
const firstNameSignal = new FirstNameSignal();
const genderSignal = new GenderSignal();
const nameFrequencySignal = new NameFrequencySignal();
const temporalSignal = new TemporalSignal();
const partyContextSignal = new PartyContextSignal();
const legacyCombiner = new LegacyCombiner();
const fsCombiner = new FellegiSunterCombiner();

/**
 * Pure scoring function — no DB, no side effects.
 * Shared between resolve() (single) and resolveBatch() (bulk).
 *
 * Evaluates signals (birthdate, department, firstName, gender) and passes
 * them to LegacyCombiner which reproduces the exact same additive/multiplicative
 * arithmetic as the original implementation. Signal logLR values are available
 * in the combiner result for Phase 2 evidence storage.
 *
 * When fsContext is provided, also evaluates Phase 2 signals and runs the
 * FellegiSunterCombiner. The F-S result is stored in the returned match for
 * inclusion in evidence JSON — it does NOT influence the decision.
 */
export function scoreCandidate(
  input: ScoringInput,
  candidate: CachedPolitician,
  blockedIds: Set<string>,
  fsContext?: {
    nameFrequency?: NameFrequencyCache;
    totalRecords?: number;
    uniqueNames?: number;
  }
): CandidateMatch {
  const isBlocked = blockedIds.has(candidate.id);

  // Build signal inputs from legacy types
  const signalInput: SignalScoringInput = {
    firstName: input.firstName,
    lastName: input.lastName,
    birthDate: input.birthDate,
    department: input.department,
    gender: input.gender,
  };

  // Phase 2: mandatePeriods/partyMemberships not wired yet (signals return neutral).
  // Phase 3 will extend CachedPolitician + ResolveInput with these fields.
  const signalCandidate: SignalCandidateRecord = {
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    birthDate: candidate.birthDate,
    departments: candidate.departments,
    gender: candidate.gender ?? null,
    prominenceScore: candidate.prominenceScore,
  };

  const context: SignalScoringContext = {
    adapter: getDefaultAdapter(),
    mode: "legacy",
  };

  // Evaluate all Phase 1 signals
  const signals = [
    birthdateSignal.evaluate(signalInput, signalCandidate, context),
    departmentSignal.evaluate(signalInput, signalCandidate, context),
    firstNameSignal.evaluate(signalInput, signalCandidate, context),
    genderSignal.evaluate(signalInput, signalCandidate, context),
  ];

  // Legacy combiner (kept for evidence/comparison)
  const legacyResult = legacyCombiner.combine(signals, {
    prominenceScore: candidate.prominenceScore,
  });

  // F-S combiner: evaluate all signals including Phase 2 additions
  const allSignals = [...signals];

  if (fsContext?.nameFrequency) {
    const fsSignalContext: SignalScoringContext = {
      adapter: getDefaultAdapter(),
      mode: "fellegi-sunter",
      nameFrequency: fsContext.nameFrequency,
      totalRecords: fsContext.totalRecords,
      uniqueNames: fsContext.uniqueNames,
    };
    allSignals.push(
      nameFrequencySignal.evaluate(signalInput, signalCandidate, fsSignalContext),
      temporalSignal.evaluate(signalInput, signalCandidate, fsSignalContext),
      partyContextSignal.evaluate(signalInput, signalCandidate, fsSignalContext)
    );
  }

  // Phase 3: F-S drives decisions when frequency data is meaningful, legacy as fallback
  const useFS = !!fsContext?.nameFrequency && (fsContext.totalRecords ?? 0) > 0;
  const fsResult = useFS ? fsCombiner.combine(allSignals) : null;

  return {
    politicianId: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    birthDate: candidate.birthDate,
    score: fsResult ? fsResult.confidence : legacyResult.confidence,
    method: fsResult ? fsResult.primaryMethod : legacyResult.primaryMethod,
    blocked: isBlocked,
    fellegiSunter: fsResult
      ? {
          compositeLogRatio: fsResult.compositeLogRatio,
          confidence: fsResult.confidence,
          judgement: fsResult.judgement,
          primaryMethod: fsResult.primaryMethod,
          signals: fsResult.signals.map((s) => ({ id: s.signalId, logLR: s.logLikelihoodRatio })),
        }
      : undefined,
  };
}

/**
 * Bulk identity resolver — pre-loads data into memory for O(1) screening.
 * Use for syncs with 1000+ records. Same scoring logic as resolve().
 */
export async function resolveBatch(batchInput: BatchResolveInput): Promise<BatchResolveResult> {
  const { inputs, sourceType, onProgress } = batchInput;

  if (inputs.length === 0) {
    return {
      results: [],
      stats: { total: 0, matched: 0, review: 0, notFound: 0, blocked: 0 },
    };
  }

  // ── Phase A: Preload all politicians + decisions in 2 parallel queries ──
  // Phase 2: Also load frequency cache for F-S dual-run (non-blocking)
  let frequencyCache: NameFrequencyCache | undefined;
  try {
    frequencyCache = await NameFrequencyCache.loadFromDb();
  } catch (err) {
    console.error("Failed to load name frequency cache for F-S dual-run:", err);
  }

  const fsContext = frequencyCache
    ? {
        nameFrequency: frequencyCache,
        totalRecords: frequencyCache.totalRecords,
        uniqueNames: frequencyCache.uniqueNames,
      }
    : undefined;

  const [allPoliticians, allDecisions] = await Promise.all([
    db.politician.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        civility: true,
        prominenceScore: true,
        mandates: {
          where: { departmentCode: { not: null } },
          select: { departmentCode: true },
        },
      },
    }),
    db.identityDecision.findMany({
      where: { sourceType, supersededBy: null },
      orderBy: { decidedAt: "desc" },
    }),
  ]);

  // Build politician lookup: normalizedLastName → CachedPolitician[]
  const politicianMap = new Map<string, CachedPolitician[]>();
  for (const p of allPoliticians) {
    const key = normalizeText(p.lastName);
    const cached: CachedPolitician = {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      birthDate: p.birthDate,
      departments: p.mandates.map((m) => m.departmentCode).filter((d): d is string => d !== null),
      gender: p.civility === "Mme" ? "F" : p.civility === "M." ? "M" : null,
      prominenceScore: p.prominenceScore,
    };
    const existing = politicianMap.get(key);
    if (existing) existing.push(cached);
    else politicianMap.set(key, [cached]);
  }

  // Build decision lookup: sourceId → Decision[]
  const decisionMap = new Map<string, typeof allDecisions>();
  for (const d of allDecisions) {
    const existing = decisionMap.get(d.sourceId);
    if (existing) existing.push(d);
    else decisionMap.set(d.sourceId, [d]);
  }

  // ── Phase B: Screen + Score (pure memory, 0 DB queries) ──
  const results: ResolveResult[] = [];
  const stats = { total: inputs.length, matched: 0, review: 0, notFound: 0, blocked: 0 };
  const decisionsToCreate: {
    sourceType: typeof sourceType;
    sourceId: string;
    politicianId: string;
    judgement: Judgement;
    confidence: number;
    method: MatchMethod;
    evidence: Prisma.InputJsonValue;
    decidedBy: string;
  }[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;

    // Lookup candidates by normalized lastName
    const key = normalizeText(input.lastName);
    const candidates = politicianMap.get(key);

    if (!candidates || candidates.length === 0) {
      stats.notFound++;
      if (onProgress && (i + 1) % 10000 === 0) onProgress(i + 1, inputs.length);
      continue;
    }

    // Check prior decisions for this sourceId
    const priorDecisions = decisionMap.get(input.sourceId) ?? [];
    const blockedIds = new Set(
      priorDecisions.filter((d) => d.judgement === Judgement.NOT_SAME).map((d) => d.politicianId)
    );

    // Check for high-confidence SAME decision → shortcircuit
    const confirmedSame = priorDecisions.find(
      (d) => d.judgement === Judgement.SAME && d.confidence >= IDENTITY_THRESHOLDS.AUTO_MATCH
    );
    if (confirmedSame) {
      stats.matched++;
      results.push({
        sourceId: input.sourceId,
        politicianId: confirmedSame.politicianId,
        confidence: confirmedSame.confidence,
        method: confirmedSame.method,
        decision: Judgement.SAME,
        candidates: [],
        blocked: false,
      });
      if (onProgress && (i + 1) % 10000 === 0) onProgress(i + 1, inputs.length);
      continue;
    }

    // Score all candidates
    const scored: CandidateMatch[] = candidates.map((c) =>
      scoreCandidate(input, c, blockedIds, fsContext)
    );

    // Sort by score descending, filter blocked
    const activeCandidates = scored.filter((c) => !c.blocked).sort((a, b) => b.score - a.score);

    // Sole-candidate boost: when exactly one politician matches by lastName
    // and the match is NAME_ONLY, the uniqueness itself is a signal
    if (activeCandidates.length === 1 && activeCandidates[0]!.method === MatchMethod.NAME_ONLY) {
      activeCandidates[0]!.score = Math.min(activeCandidates[0]!.score + 0.05, 0.94);
    }

    const allBlocked = scored.length > 0 && activeCandidates.length === 0;
    const bestMatch = activeCandidates[0];

    if (allBlocked) {
      stats.blocked++;
      if (onProgress && (i + 1) % 10000 === 0) onProgress(i + 1, inputs.length);
      continue;
    }

    if (!bestMatch || bestMatch.score < IDENTITY_THRESHOLDS.REVIEW) {
      stats.notFound++;
      if (onProgress && (i + 1) % 10000 === 0) onProgress(i + 1, inputs.length);
      continue;
    }

    // Determine judgement: use F-S judgement when available, legacy thresholds as fallback
    let judgement: Judgement;
    const fsJudgement = bestMatch.fellegiSunter?.judgement;
    if (fsJudgement === Judgement.SAME) {
      judgement = Judgement.SAME;
      stats.matched++;
    } else if (fsJudgement === Judgement.NOT_SAME) {
      stats.notFound++;
      if (onProgress && (i + 1) % 10000 === 0) onProgress(i + 1, inputs.length);
      continue;
    } else if (fsJudgement === Judgement.UNDECIDED) {
      judgement = Judgement.UNDECIDED;
      stats.review++;
    } else if (bestMatch.score >= IDENTITY_THRESHOLDS.AUTO_MATCH) {
      // Legacy fallback (no F-S data)
      judgement = Judgement.SAME;
      stats.matched++;
    } else {
      judgement = Judgement.UNDECIDED;
      stats.review++;
    }

    results.push({
      sourceId: input.sourceId,
      politicianId: bestMatch.politicianId,
      confidence: bestMatch.score,
      method: bestMatch.method,
      decision: judgement,
      candidates: scored,
      blocked: false,
    });

    // Accumulate decision to persist
    decisionsToCreate.push({
      sourceType,
      sourceId: input.sourceId,
      politicianId: bestMatch.politicianId,
      judgement,
      confidence: bestMatch.score,
      method: bestMatch.method,
      evidence: safeJsonParseOrThrow(
        JSON.stringify({
          version: 3,
          mode: bestMatch.fellegiSunter ? "fellegi-sunter" : "legacy",
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate?.toISOString() ?? null,
          department: input.department ?? null,
          gender: input.gender ?? null,
          candidateCount: scored.length,
          context: input.context ?? null,
          fellegiSunter: bestMatch.fellegiSunter ?? null,
        })
      ) as Prisma.InputJsonValue,
      decidedBy: `system:sync-${input.source.toLowerCase()}`,
    });

    if (onProgress && (i + 1) % 10000 === 0) onProgress(i + 1, inputs.length);
  }

  // ── Phase C: Persist (batch writes in chunks of 100) ──
  const CHUNK_SIZE = 100;
  for (let i = 0; i < decisionsToCreate.length; i += CHUNK_SIZE) {
    const chunk = decisionsToCreate.slice(i, i + CHUNK_SIZE);
    try {
      await db.identityDecision.createMany({ data: chunk });
    } catch {
      // Fallback: individual creates (e.g. partial duplicates)
      for (const d of chunk) {
        try {
          await db.identityDecision.create({ data: d });
        } catch {
          console.error(
            `[resolveBatch] Failed to persist decision for ${d.sourceType}:${d.sourceId}`
          );
        }
      }
    }
  }

  // Final progress callback
  if (onProgress) onProgress(inputs.length, inputs.length);

  return { results, stats };
}

/**
 * Unified identity resolver — replaces per-sync matching logic.
 *
 * Pipeline:
 * 1. Check prior IdentityDecisions (NOT_SAME blocks, SAME auto-matches)
 * 2. Deterministic match via shared ExternalId
 * 3. Birthdate match (name + birthdate ±1 day)
 * 4. Department match (name + existing mandate in same dept)
 * 5. Name-only scoring (lowest confidence)
 * 6. Threshold decision (auto-match / review / reject)
 * 7. Log decision to IdentityDecision table
 */
export async function resolve(input: ResolveInput): Promise<ResolveResult> {
  const { firstName, lastName, source, sourceId } = input;

  // ── Step 1: Check prior decisions ──────────────────────────────
  const priorDecisions = await db.identityDecision.findMany({
    where: {
      sourceType: source,
      sourceId,
      supersededBy: null, // only active decisions
    },
    orderBy: { decidedAt: "desc" },
  });

  const blockedIds = new Set(
    priorDecisions.filter((d) => d.judgement === Judgement.NOT_SAME).map((d) => d.politicianId)
  );

  // If there's a high-confidence SAME decision, return immediately
  const confirmedSame = priorDecisions.find(
    (d) => d.judgement === Judgement.SAME && d.confidence >= IDENTITY_THRESHOLDS.AUTO_MATCH
  );
  if (confirmedSame) {
    return {
      sourceId,
      politicianId: confirmedSame.politicianId,
      confidence: confirmedSame.confidence,
      method: confirmedSame.method,
      decision: Judgement.SAME,
      candidates: [],
      blocked: false,
    };
  }

  // ── Step 2: Deterministic match via ExternalId ─────────────────
  const existingLink = await db.externalId.findFirst({
    where: { source, externalId: sourceId, politicianId: { not: null } },
    select: { politicianId: true },
  });

  if (existingLink?.politicianId && !blockedIds.has(existingLink.politicianId)) {
    const result: ResolveResult = {
      sourceId,
      politicianId: existingLink.politicianId,
      confidence: 1.0,
      method: MatchMethod.EXTERNAL_ID,
      decision: Judgement.SAME,
      candidates: [],
      blocked: false,
    };
    await logDecision(input, result);
    return result;
  }

  // Phase 2: Load frequency cache for F-S dual-run (non-blocking).
  // TODO(phase3): cache at module level with TTL to avoid per-call DB query
  let resolveFrequencyCache: NameFrequencyCache | undefined;
  try {
    resolveFrequencyCache = await NameFrequencyCache.loadFromDb();
  } catch (err) {
    console.error("Failed to load name frequency cache for F-S resolve:", err);
  }
  const resolveFsContext = resolveFrequencyCache
    ? {
        nameFrequency: resolveFrequencyCache,
        totalRecords: resolveFrequencyCache.totalRecords,
        uniqueNames: resolveFrequencyCache.uniqueNames,
      }
    : undefined;

  // ── Steps 3-5: Candidate matching ─────────────────────────────
  const nameCandidates = await db.politician.findMany({
    where: {
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      civility: true,
      prominenceScore: true,
      mandates: {
        where: { departmentCode: { not: null } },
        select: { departmentCode: true },
      },
    },
  });

  const candidates: CandidateMatch[] = nameCandidates.map((p) => {
    const cached: CachedPolitician = {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      birthDate: p.birthDate,
      departments: p.mandates.map((m) => m.departmentCode).filter((d): d is string => d !== null),
      gender: p.civility === "Mme" ? "F" : p.civility === "M." ? "M" : null,
      prominenceScore: p.prominenceScore,
    };
    return scoreCandidate(input, cached, blockedIds, resolveFsContext);
  });

  // Sort by score descending, filter blocked
  const activeCandidates = candidates.filter((c) => !c.blocked).sort((a, b) => b.score - a.score);

  // Sole-candidate boost: when exactly one politician matches by name
  // and the match is NAME_ONLY, the uniqueness itself is a signal
  if (activeCandidates.length === 1 && activeCandidates[0]!.method === MatchMethod.NAME_ONLY) {
    activeCandidates[0]!.score = Math.min(activeCandidates[0]!.score + 0.05, 0.94);
  }

  // ── Step 6: Threshold decision ─────────────────────────────────
  const allBlocked = candidates.length > 0 && activeCandidates.length === 0;
  const bestMatch = activeCandidates[0];

  let result: ResolveResult;

  // Use F-S judgement when available, legacy thresholds as fallback
  const fsJudgement = bestMatch?.fellegiSunter?.judgement;

  if (!bestMatch || bestMatch.score < IDENTITY_THRESHOLDS.REVIEW) {
    result = {
      sourceId,
      politicianId: null,
      confidence: bestMatch?.score ?? 0,
      method: bestMatch?.method ?? MatchMethod.NAME_ONLY,
      decision: "NEW",
      candidates,
      blocked: allBlocked,
    };
  } else if (fsJudgement === Judgement.SAME) {
    result = {
      sourceId,
      politicianId: bestMatch.politicianId,
      confidence: bestMatch.score,
      method: bestMatch.method,
      decision: Judgement.SAME,
      candidates,
      blocked: false,
    };
  } else if (fsJudgement === Judgement.NOT_SAME) {
    result = {
      sourceId,
      politicianId: null,
      confidence: bestMatch.score,
      method: bestMatch.method,
      decision: "NEW",
      candidates,
      blocked: false,
    };
  } else if (fsJudgement === Judgement.UNDECIDED) {
    result = {
      sourceId,
      politicianId: bestMatch.politicianId,
      confidence: bestMatch.score,
      method: bestMatch.method,
      decision: Judgement.UNDECIDED,
      candidates,
      blocked: false,
    };
  } else if (bestMatch.score >= IDENTITY_THRESHOLDS.AUTO_MATCH) {
    // Legacy fallback (no F-S data)
    result = {
      sourceId,
      politicianId: bestMatch.politicianId,
      confidence: bestMatch.score,
      method: bestMatch.method,
      decision: Judgement.SAME,
      candidates,
      blocked: false,
    };
  } else {
    result = {
      sourceId,
      politicianId: bestMatch.politicianId,
      confidence: bestMatch.score,
      method: bestMatch.method,
      decision: Judgement.UNDECIDED,
      candidates,
      blocked: false,
    };
  }

  // ── Step 7: Log decision ───────────────────────────────────────
  await logDecision(input, result);

  return result;
}

async function logDecision(input: ResolveInput, result: ResolveResult): Promise<void> {
  if (!result.politicianId && result.decision === "NEW") return;

  const politicianId = result.politicianId;
  if (!politicianId) return;

  try {
    await db.identityDecision.create({
      data: {
        sourceType: input.source,
        sourceId: input.sourceId,
        politicianId,
        judgement: result.decision === "NEW" ? Judgement.UNDECIDED : (result.decision as Judgement),
        confidence: result.confidence,
        method: result.method,
        evidence: {
          version: 3,
          mode: result.candidates.find((c) => c.politicianId === politicianId)?.fellegiSunter
            ? "fellegi-sunter"
            : "legacy",
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate?.toISOString() ?? null,
          department: input.department ?? null,
          gender: input.gender ?? null,
          candidateCount: result.candidates.length,
          context: input.context
            ? safeJsonParseOrThrow<Prisma.InputJsonValue>(JSON.stringify(input.context))
            : null,
          fellegiSunter:
            result.candidates.find((c) => c.politicianId === politicianId)?.fellegiSunter ?? null,
        },
        decidedBy: `system:sync-${input.source.toLowerCase()}`,
      },
    });
  } catch {
    // Non-blocking: don't let logging failure break the sync
    console.error(
      `[IdentityResolver] Failed to log decision for ${input.source}:${input.sourceId}`
    );
  }
}
