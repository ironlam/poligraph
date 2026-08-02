import { db } from "@/lib/db";
import { reviewProvenance, type ReviewProvenance } from "@/lib/affairs/review-provenance";

/**
 * Display data for the matching decisions that block a publication.
 *
 * `publish-guard` already returns their ids, but the refusal used to be flattened to a
 * sentence, so a moderator was told a decision blocked them and given no way to reach it.
 * The review page only filters by tab and paginates twenty at a time, so even with the id
 * in hand the decision was unreachable. This loads what it takes to judge in place.
 */
export interface BlockingCandidate {
  politicianId: string;
  fullName: string;
  score: number;
  /** Human-readable explanations of the signals that argued FOR this candidate. */
  supporting: string[];
  /** And those that argued against, which are the ones worth a second look. */
  opposing: string[];
}

export interface BlockingDecision {
  id: string;
  judgment: string;
  /**
   * Qui a déjà tranché, s'il y a eu une revue.
   *
   * « ASSISTED » change la question posée au modérateur : ce n'est plus « qui est-ce ? »
   * mais « la machine dit oui, êtes-vous d'accord ? ». C'est le sens même de la
   * validation assistée, et le cacher la ramènerait à un examen à froid.
   */
  provenance: ReviewProvenance;
  reviewedBy: string | null;
  source: string;
  sourceRef: string;
  /** The press text the resolver read. This is what a human has to judge. */
  excerpt: string;
  candidates: BlockingCandidate[];
}

interface RawSignal {
  signalId: string;
  logLikelihoodRatio: number;
  explanation?: string;
}

interface RawCandidate {
  candidateId: string;
  totalScore: number;
  signals?: RawSignal[];
}

/** Enough to judge without scrolling, short enough to sit under an error message. */
const EXCERPT_LENGTH = 600;

export async function loadBlockingDecisions(
  decisionIds: readonly string[]
): Promise<BlockingDecision[]> {
  if (decisionIds.length === 0) return [];

  const rows = await db.affairPoliticianDecision.findMany({
    where: { id: { in: [...decisionIds] } },
    select: {
      id: true,
      judgment: true,
      source: true,
      sourceRef: true,
      candidateText: true,
      topCandidates: true,
      reviewedBy: true,
    },
  });

  // The stored candidate carries only an id, never a name, so the label has to be
  // resolved here. Without it the panel would show a cuid and judge nothing.
  const candidateIds = new Set<string>();
  for (const row of rows) {
    for (const c of (row.topCandidates as RawCandidate[] | null) ?? []) {
      if (c?.candidateId) candidateIds.add(c.candidateId);
    }
  }

  const politicians = await db.politician.findMany({
    where: { id: { in: [...candidateIds] } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(politicians.map((p) => [p.id, p.fullName]));

  return rows.map((row) => ({
    id: row.id,
    judgment: row.judgment,
    provenance: reviewProvenance(row.reviewedBy),
    reviewedBy: row.reviewedBy,
    source: row.source,
    sourceRef: row.sourceRef,
    excerpt: row.candidateText.replace(/\s+/g, " ").slice(0, EXCERPT_LENGTH),
    candidates: ((row.topCandidates as RawCandidate[] | null) ?? [])
      .filter((c) => c?.candidateId)
      .map((c) => {
        const signals = c.signals ?? [];
        return {
          politicianId: c.candidateId,
          // A deleted politician leaves the decision pointing nowhere; say so rather
          // than render an empty name.
          fullName: nameById.get(c.candidateId) ?? "(politicien introuvable)",
          score: c.totalScore,
          supporting: signals
            .filter((s) => s.logLikelihoodRatio > 0)
            .map((s) => s.explanation ?? s.signalId),
          opposing: signals
            .filter((s) => s.logLikelihoodRatio < 0)
            .map((s) => s.explanation ?? s.signalId),
        };
      }),
  }));
}
