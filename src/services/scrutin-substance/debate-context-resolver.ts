/**
 * READ-ONLY resolver around the pure `findAmendmentMention` matcher. For a
 * scrutin, it gathers the SAME-DAY candidate transcripts and returns the best
 * mention with a bounded excerpt and a confidence. NO model call, NO DB write.
 *
 * CANDIDATE SCOPE = same-day only, NOT yet dossier/session-disambiguated. A HIGH
 * therefore proves the amendment number appears in a same-day transcript, NOT
 * that this transcript is the right one when several debates/dossiers coexist on
 * the same day. `candidateTranscriptCount > 1` flags that ambiguity.
 *
 * PROVISIONAL: depends on the per-séance transcript linkage (a transcript is
 * stored per day) and on the matcher's regex, both still to be hardened. Use for
 * read-only audit only; do NOT wire into generation yet.
 */
import { db } from "@/lib/db";
import {
  applyAmbiguity,
  findAmendmentMention,
  type AmendmentRef,
  type AmendmentMention,
  type DebateContextConfidence,
} from "./debate-context";
import { classifyDebateMatch, type DebateMatchClass } from "./debate-mapping";

/** How candidate transcripts were gathered. Only "same-day" exists today;
 *  a future PR may add dossier/session disambiguation. */
export type CandidateScope = "same-day";

export interface DebateContextResult extends AmendmentMention {
  scrutinId: string;
  transcriptSeanceRef: string | null;
  hasCandidateTranscript: boolean;
  /** Always "same-day" for now — see module header. Never a definitive linkage. */
  candidateScope: CandidateScope;
  /** Number of same-day candidate transcripts considered. > 1 => ambiguous day. */
  candidateTranscriptCount: number;
  /** How many of those candidates explicitly mention the amendment (HIGH). === 1
   *  means the debate is uniquely localizable to a single séance, even on a
   *  multi-séance day — the key signal for a future per-séance scoping. */
  transcriptsMentioningAmendment: number;
}

const RANK: Record<DebateContextConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

/** First author's surname, cleaned of AN HTML entities and civility prefix. */
export function extractAuthorSurname(authorName: string | null | undefined): string | null {
  if (!authorName) return null;
  const cleaned = authorName
    .replace(/&#160;|&nbsp;/gi, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const first = cleaned.split(",")[0]?.trim() ?? "";
  const noCiv = first.replace(/^(mmes?|mm\.?|m\.?|mlle)\s+/i, "").trim();
  return noCiv.length >= 3 ? noCiv : null;
}

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function resolveDebateContextForScrutin(
  scrutinId: string
): Promise<DebateContextResult> {
  const scrutin = await db.scrutin.findUnique({
    where: { id: scrutinId },
    select: {
      votingDate: true,
      amendmentLinks: {
        select: { amendment: { select: { number: true, authorName: true, article: true } } },
      },
    },
  });

  const base: DebateContextResult = {
    scrutinId,
    confidence: "NONE",
    reason: "Aucune mention claire de l'amendement dans le débat.",
    excerpt: null,
    context: null,
    matchedAmendmentNumber: null,
    usableForGeneration: false,
    reinforced: false,
    transcriptSeanceRef: null,
    hasCandidateTranscript: false,
    candidateScope: "same-day",
    candidateTranscriptCount: 0,
    transcriptsMentioningAmendment: 0,
  };

  if (!scrutin) return base;

  const refs: AmendmentRef[] = scrutin.amendmentLinks.map((l) => ({
    number: l.amendment.number,
    authorSurname: extractAuthorSurname(l.amendment.authorName),
    article: l.amendment.article,
  }));
  if (refs.length === 0) return base;

  const { start, end } = dayBounds(scrutin.votingDate);
  const candidates = await db.debateTranscript.findMany({
    where: { date: { gte: start, lte: end } },
    select: { seanceRef: true, content: true },
  });

  base.hasCandidateTranscript = candidates.length > 0;
  base.candidateTranscriptCount = candidates.length;

  let best = base;
  let mentioning = 0;
  for (const t of candidates) {
    const m = findAmendmentMention(t.content, refs);
    if (m.confidence === "HIGH") mentioning++;
    if (RANK[m.confidence] > RANK[best.confidence]) {
      best = { ...base, ...m, transcriptSeanceRef: t.seanceRef };
    }
  }
  best.transcriptsMentioningAmendment = mentioning;
  return applyAmbiguity(best, mentioning);
}

export interface DebateContextAuditRow {
  scrutinId: string;
  slug: string | null;
  amendment: string;
  hasCandidateTranscript: boolean;
  /** Always "same-day": candidates are not yet dossier/session-disambiguated. */
  candidateScope: CandidateScope;
  candidateTranscriptCount: number;
  confidence: DebateContextConfidence;
  usableForGeneration: boolean;
  reason: string;
  excerpt: string | null;
}

export interface DebateContextAudit {
  scanned: number;
  byConfidence: Record<DebateContextConfidence, number>;
  rows: DebateContextAuditRow[];
}

/**
 * READ-ONLY audit over amendment-linked scrutins that already have an analysis.
 * For each, reports whether a candidate transcript exists and how strongly it
 * mentions the voted amendment. No write, no model call.
 */
export async function auditDebateContextForAmendmentAnalyses(options?: {
  limit?: number;
}): Promise<DebateContextAudit> {
  const scrutins = await db.scrutin.findMany({
    where: { amendmentLinks: { some: {} }, analysis: { isNot: null } },
    orderBy: { votingDate: "desc" },
    select: {
      id: true,
      slug: true,
      amendmentLinks: { select: { amendment: { select: { number: true } } }, take: 1 },
    },
    ...(options?.limit ? { take: options.limit } : {}),
  });

  const byConfidence: Record<DebateContextConfidence, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NONE: 0,
  };
  const rows: DebateContextAuditRow[] = [];

  for (const s of scrutins) {
    const ctx = await resolveDebateContextForScrutin(s.id);
    byConfidence[ctx.confidence]++;
    rows.push({
      scrutinId: s.id,
      slug: s.slug,
      amendment: s.amendmentLinks[0]?.amendment.number ?? "?",
      hasCandidateTranscript: ctx.hasCandidateTranscript,
      candidateScope: ctx.candidateScope,
      candidateTranscriptCount: ctx.candidateTranscriptCount,
      confidence: ctx.confidence,
      usableForGeneration: ctx.usableForGeneration,
      reason: ctx.reason,
      excerpt: ctx.excerpt,
    });
  }

  return { scanned: scrutins.length, byConfidence, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Key-vote mapping audit: the deterministic scrutin ↔ débat quality measurement.
// Scope = key votes (ScrutinImportance.isKeyVote) that are linked to an amendment,
// the only perimeter where the amendment-number matcher can prove a linkage.
// Read-only: no write, no model call.
// ─────────────────────────────────────────────────────────────────────────────

export interface KeyScrutinMappingRow {
  scrutinId: string;
  externalId: string;
  slug: string | null;
  votingDate: string; // YYYY-MM-DD
  amendmentNumber: string;
  matchClass: DebateMatchClass;
  confidence: DebateContextConfidence;
  hasCandidateTranscript: boolean;
  candidateTranscriptCount: number;
  reinforced: boolean;
  /** HIGH where exactly one same-day séance cites the amendment: the debate is
   *  uniquely localizable. Stays `ambiguous` under the strict rule, but measures
   *  what a per-séance scoping could promote to `matched`. */
  uniquelyLocalizable: boolean;
  matchReason: string;
  classReason: string;
  transcriptSeanceRef: string | null;
  excerpt: string | null;
}

export interface KeyScrutinMappingAudit {
  scope: {
    keyVotesWithAmendment: number;
    keyVotesWithoutAmendment: number;
  };
  totals: {
    scanned: number;
    /** Transcripts gathered by date only (same-day), NOT a proven linkage. */
    withSameDayTranscript: number;
    /** HIGH: amendment number explicitly cited in the debate. The only proof. */
    confidenceHigh: number;
    /** MEDIUM/LOW: author/article only, never a sufficient explicit reference. */
    confidenceMediumLow: number;
    /** NONE: no exploitable signal, despite a same-day transcript. */
    confidenceNone: number;
    matched: number;
    ambiguous: number;
    unsafe: number;
    missing: number;
    /** Ambiguous cases a per-séance scoping could safely promote to matched. */
    uniquelyLocalizable: number;
  };
  rows: KeyScrutinMappingRow[];
}

/** Resolve + classify a single scrutin into an auditable mapping row. */
export async function mapScrutinDebate(scrutin: {
  id: string;
  externalId: string;
  slug: string | null;
  votingDate: Date;
  amendmentNumber: string;
}): Promise<KeyScrutinMappingRow> {
  const ctx = await resolveDebateContextForScrutin(scrutin.id);
  const verdict = classifyDebateMatch({
    hasCandidateTranscript: ctx.hasCandidateTranscript,
    candidateTranscriptCount: ctx.candidateTranscriptCount,
    confidence: ctx.confidence,
  });
  return {
    scrutinId: scrutin.id,
    externalId: scrutin.externalId,
    slug: scrutin.slug,
    votingDate: scrutin.votingDate.toISOString().slice(0, 10),
    amendmentNumber: scrutin.amendmentNumber,
    matchClass: verdict.class,
    confidence: ctx.confidence,
    hasCandidateTranscript: ctx.hasCandidateTranscript,
    candidateTranscriptCount: ctx.candidateTranscriptCount,
    reinforced: ctx.reinforced,
    uniquelyLocalizable: ctx.confidence === "HIGH" && ctx.transcriptsMentioningAmendment === 1,
    matchReason: ctx.reason,
    classReason: verdict.reason,
    transcriptSeanceRef: ctx.transcriptSeanceRef,
    excerpt: ctx.excerpt,
  };
}

export async function auditKeyScrutinDebateMapping(options?: {
  limit?: number;
}): Promise<KeyScrutinMappingAudit> {
  const [keyVotesWithAmendment, keyVotesWithoutAmendment] = await Promise.all([
    db.scrutin.count({
      where: { importance: { isKeyVote: true }, amendmentLinks: { some: {} } },
    }),
    db.scrutin.count({
      where: { importance: { isKeyVote: true }, amendmentLinks: { none: {} } },
    }),
  ]);

  const scrutins = await db.scrutin.findMany({
    where: { importance: { isKeyVote: true }, amendmentLinks: { some: {} } },
    orderBy: { votingDate: "desc" },
    select: {
      id: true,
      externalId: true,
      slug: true,
      votingDate: true,
      amendmentLinks: { select: { amendment: { select: { number: true } } }, take: 1 },
    },
    ...(options?.limit ? { take: options.limit } : {}),
  });

  const rows: KeyScrutinMappingRow[] = [];
  for (const s of scrutins) {
    rows.push(
      await mapScrutinDebate({
        id: s.id,
        externalId: s.externalId,
        slug: s.slug,
        votingDate: s.votingDate,
        amendmentNumber: s.amendmentLinks[0]?.amendment.number ?? "?",
      })
    );
  }

  const count = (c: DebateMatchClass): number => rows.filter((r) => r.matchClass === c).length;

  return {
    scope: { keyVotesWithAmendment, keyVotesWithoutAmendment },
    totals: {
      scanned: rows.length,
      withSameDayTranscript: rows.filter((r) => r.hasCandidateTranscript).length,
      confidenceHigh: rows.filter((r) => r.confidence === "HIGH").length,
      confidenceMediumLow: rows.filter((r) => r.confidence === "MEDIUM" || r.confidence === "LOW")
        .length,
      confidenceNone: rows.filter((r) => r.confidence === "NONE").length,
      matched: count("matched"),
      ambiguous: count("ambiguous"),
      unsafe: count("unsafe"),
      missing: count("missing"),
      uniquelyLocalizable: rows.filter((r) => r.uniquelyLocalizable).length,
    },
    rows,
  };
}
