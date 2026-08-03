import type { ScrutinType } from "@/generated/prisma";
import { normalizeTitle, titleSimilarity } from "@/lib/votes/explained-scoring";

/**
 * Ranking and rotation for the "votes clés" hub surface.
 *
 * The previous selection ordered strictly by `votingDate desc`, so the hero was
 * always the newest key vote and the hub froze for weeks as soon as the Parlement
 * stopped voting (recess, dissolution, any gap between two séances). It also let a
 * sub-amendement headline the page, because the importance score alone barely
 * separates an amendement from a vote solennel.
 *
 * Three changes fix that, all of them here so they stay testable:
 *  - the rank blends importance, recency decay and the procedural weight of the
 *    vote, instead of sorting on the date;
 *  - a pool wider than the surface is built and de-duplicated per dossier, so the
 *    hub is not six views of the same texte;
 *  - the visible slice rotates through that pool on a daily index, so the page
 *    moves even when no new scrutin has been recorded.
 */

/** Points added to a vote of the day, decaying by half every half-life. */
const RECENCY_MAX = 40;
const RECENCY_HALFLIFE_DAYS = 60;

/**
 * Procedural weight. A vote solennel or a motion decides a text or the fate of a
 * government; an amendement rarely does. `IMPORTANCE_WEIGHTS.voteType` already
 * carries part of this, but it is diluted by the other signals: 522 of the 615 key
 * votes recorded over the last six months are amendements.
 */
const DECISIVENESS_BONUS: Record<ScrutinType, number> = {
  FINAL: 18,
  MOTION: 18,
  ARTICLE: 6,
  AMENDEMENT: 0,
  AUTRE: 0,
};

/** Types allowed to headline the hero slot when the pool offers a choice. */
const HERO_TYPES: ScrutinType[] = ["FINAL", "MOTION"];

/** Same dossier, same day, near-identical wording: keep only the first. */
const TITLE_SIMILARITY_THRESHOLD = 0.8;

/** How long a given rotation offset stays in place. */
const ROTATION_PERIOD_DAYS = 1;

export interface KeyVoteCandidate {
  id: string;
  title: string;
  votingDate: Date;
  dossierLegislatifId: string | null;
  type: ScrutinType | null;
  importanceScore: number;
}

export function scoreKeyVote(c: KeyVoteCandidate, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - c.votingDate.getTime()) / 86_400_000);
  const recency = RECENCY_MAX * Math.pow(0.5, ageDays / RECENCY_HALFLIFE_DAYS);
  const decisiveness = c.type ? DECISIVENESS_BONUS[c.type] : 0;
  return c.importanceScore + recency + decisiveness;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function isNearDuplicate(a: KeyVoteCandidate, b: KeyVoteCandidate): boolean {
  if (!a.dossierLegislatifId || !b.dossierLegislatifId) return false;
  if (a.dossierLegislatifId !== b.dossierLegislatifId) return false;
  if (!isSameCalendarDay(a.votingDate, b.votingDate)) return false;
  return (
    titleSimilarity(normalizeTitle(a.title), normalizeTitle(b.title)) >= TITLE_SIMILARITY_THRESHOLD
  );
}

/**
 * Best `size` candidates, at most `maxPerDossier` per dossier législatif.
 * Expects `sorted` ranked best-first.
 */
export function buildKeyVotePool<T extends KeyVoteCandidate>(
  sorted: T[],
  opts: { size: number; maxPerDossier: number }
): T[] {
  const perDossier = new Map<string, number>();
  const pool: T[] = [];
  for (const c of sorted) {
    if (pool.length >= opts.size) break;
    if (c.dossierLegislatifId) {
      const n = perDossier.get(c.dossierLegislatifId) ?? 0;
      if (n >= opts.maxPerDossier) continue;
      if (pool.some((p) => isNearDuplicate(p, c))) continue;
      perDossier.set(c.dossierLegislatifId, n + 1);
    }
    pool.push(c);
  }
  return pool;
}

/**
 * Which slice of the pool is on display right now. Advances once per
 * `ROTATION_PERIOD_DAYS`, deterministically: two renders of the same day pick the
 * same votes, which keeps the cached page stable and the URL shareable.
 */
export function rotationOffset(now: Date, poolSize: number): number {
  if (poolSize <= 0) return 0;
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  return Math.floor(dayIndex / ROTATION_PERIOD_DAYS) % poolSize;
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const o = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(o), ...items.slice(0, o)];
}

/**
 * Hero + grid for the hub. The hero rotates through the decisive votes of the pool
 * (falling back to the whole pool when none is decisive), the grid rotates through
 * the rest.
 */
export function selectKeyVotes<T extends KeyVoteCandidate>(
  candidates: T[],
  opts: { now: Date; gridCount: number; poolSize: number; maxPerDossier: number }
): { hero: T | null; grid: T[] } {
  const ranked = [...candidates].sort(
    (a, b) => scoreKeyVote(b, opts.now) - scoreKeyVote(a, opts.now)
  );
  const pool = buildKeyVotePool(ranked, {
    size: opts.poolSize,
    maxPerDossier: opts.maxPerDossier,
  });
  if (pool.length === 0) return { hero: null, grid: [] };

  const heroPool = pool.filter((c) => c.type && HERO_TYPES.includes(c.type));
  const effectiveHeroPool = heroPool.length > 0 ? heroPool : pool;
  const hero = effectiveHeroPool[rotationOffset(opts.now, effectiveHeroPool.length)]!;

  const rest = pool.filter((c) => c.id !== hero.id);
  const grid = rotate(rest, rotationOffset(opts.now, rest.length)).slice(0, opts.gridCount);

  return { hero, grid };
}
