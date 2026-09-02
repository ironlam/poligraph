/**
 * Fact-check sync service.
 *
 * Searches for fact-checked claims about French politicians using the
 * Google Fact Check Tools API (ClaimReview standard).
 */

import { db } from "@/lib/db";
import { DataSource } from "@/generated/prisma";
import { searchClaims, mapTextualRating, fetchPageTitle } from "@/lib/api";
import { FACTCHECK_RATE_LIMIT_MS } from "@/config/rate-limits";
import {
  normalizeText,
  buildPoliticianIndex,
  findMentions,
  type PoliticianName,
} from "@/lib/name-matching";
import {
  isDirectPoliticianClaim,
  canonicalizeFactCheckSource,
  FACTCHECK_ALLOWED_SOURCES,
} from "@/config/labels";
import { generateDateSlug, generateUniqueSlug, sleep } from "@/lib/utils";
import { loadMentionBlocklist, type MentionBlocklist } from "@/lib/identity/mention-blocklist";
import { syncMetadata } from "@/lib/sync";

/**
 * Publishable when the publisher is on the allow-list, compared on the
 * canonical label so a case or word-order variant of an allowed outlet is not
 * mistaken for an unknown one.
 */
export function getPublicationStatusForSource(source: string): "PUBLISHED" | "DRAFT" {
  return FACTCHECK_ALLOWED_SOURCES.includes(canonicalizeFactCheckSource(source))
    ? "PUBLISHED"
    : "DRAFT";
}

/**
 * How many politicians the default (cron) target list draws from, ranked by
 * prominence. 22 000+ hold a current mandate, nearly all of them local
 * councillors no fact-checker writes about, and the daily cron searches 50 per
 * run; walking the whole set would take five months per pass. Capping the pool
 * at the most prominent 1 200 keeps a full pass under ten days at the current
 * cadence (3 runs/day x --limit=50), which is the latency a new fact-check
 * about a rank-1000 politician waits before it is picked up.
 */
export const FACTCHECK_SEARCH_POOL_SIZE = 1200;

/** SyncMetadata row holding where the last run stopped in that pool. */
const FACTCHECK_ROTATION_KEY = "factchecks:search-rotation";

/**
 * `count` items starting at `offset`, wrapping past the end of the list. The
 * rotation is what makes the pool reachable: without it every run searched the
 * same slice and the rest of the pool was never queried at all.
 */
export function rotateWindow<T>(items: T[], offset: number, count: number): T[] {
  if (items.length === 0) return [];
  const size = Math.min(count, items.length);
  const start = ((offset % items.length) + items.length) % items.length;
  return Array.from({ length: size }, (_, i) => items[(start + i) % items.length]!);
}

/** Stored offset, or 0 when absent or unreadable. */
async function readRotationOffset(): Promise<number> {
  const state = await syncMetadata.get(FACTCHECK_ROTATION_KEY);
  const stored = Number(state?.cursor);
  return Number.isInteger(stored) && stored >= 0 ? stored : 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactcheckSyncOptions {
  dryRun?: boolean;
  force?: boolean;
  limit?: number;
  politician?: string;
  all?: boolean;
}

export interface FactcheckSyncStats {
  politiciansSearched: number;
  /** Size of the pool the searched politicians were drawn from. */
  searchPoolSize: number;
  /** Offset the run started at inside that pool (0 when not rotating). */
  rotationOffset: number;
  claimsFound: number;
  factChecksCreated: number;
  factChecksSkipped: number;
  mentionsCreated: number;
  mentionsBlocked: number;
  apiErrors: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateUniqueFactCheckSlug(date: Date | null, title: string): Promise<string> {
  const baseSlug = generateDateSlug(date, title);
  return generateUniqueSlug(baseSlug, (s) =>
    db.factCheck.findUnique({ where: { slug: s } }).then(Boolean)
  );
}

/**
 * Given a claimant string, return the set of politician IDs that match it.
 * Uses fullNameOnly mode to avoid false positives on short claimant strings
 * (e.g. "Olivier Véran" should NOT match Philippe Olivier).
 */
function computeClaimantIds(
  claimant: string | null | undefined,
  allPoliticians: PoliticianName[],
  blocklist: MentionBlocklist
): Set<string> {
  if (!claimant || !isDirectPoliticianClaim(claimant)) return new Set();
  return new Set(
    findMentions(claimant, allPoliticians, { fullNameOnly: true })
      .filter((m) => !blocklist.isBlocked(m.matchedName, m.politicianId))
      .map((m) => m.politicianId)
  );
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export async function syncFactchecks(
  options: FactcheckSyncOptions = {}
): Promise<FactcheckSyncStats> {
  const {
    dryRun = false,
    force = false,
    limit,
    politician: politicianFilter,
    all = false,
  } = options;

  const stats: FactcheckSyncStats = {
    politiciansSearched: 0,
    searchPoolSize: 0,
    rotationOffset: 0,
    claimsFound: 0,
    factChecksCreated: 0,
    factChecksSkipped: 0,
    mentionsCreated: 0,
    mentionsBlocked: 0,
    apiErrors: 0,
    errors: [],
  };

  // Build politician index + blocklist for mention matching
  const allPoliticians = await buildPoliticianIndex();
  const blocklist = await loadMentionBlocklist(DataSource.FACTCHECK);

  // Determine which politicians to search
  let searchTargets: Array<{ id: string; fullName: string }>;
  /** Only the default (cron) target list walks the pool across runs. */
  let rotates = false;
  let nextRotationOffset: number | null = null;

  if (politicianFilter) {
    const normalized = normalizeText(politicianFilter);
    searchTargets = allPoliticians
      .filter(
        (p) =>
          p.normalizedFullName.includes(normalized) || p.normalizedLastName.includes(normalized)
      )
      .map((p) => ({ id: p.id, fullName: p.fullName }));

    if (searchTargets.length === 0) {
      return stats;
    }
  } else if (all) {
    // Same population as buildPoliticianIndex (published politicians), but
    // prominence-ranked so that a --limit here takes the politicians most
    // likely to be fact-checked rather than an arbitrary slice of 37 000 rows.
    const everyone = await db.politician.findMany({
      where: { publicationStatus: "PUBLISHED" },
      select: { id: true, fullName: true },
      orderBy: [{ prominenceScore: "desc" }, { id: "asc" }],
    });
    searchTargets = everyone;
  } else {
    // Default: politicians holding a current mandate, most prominent first,
    // capped at FACTCHECK_SEARCH_POOL_SIZE. The order is the whole of the
    // coverage decision — this query used to have none, so the cron's 50 came
    // out in whatever physical order the table happened to be in, and
    // recalculate-prominence rewrites every row three times a day, which
    // reshuffles it. Coverage was 0.2% of the corpus, re-drawn at random.
    const pool = await db.politician.findMany({
      where: { mandates: { some: { isCurrent: true } } },
      select: { id: true, fullName: true },
      orderBy: [{ prominenceScore: "desc" }, { id: "asc" }],
      take: FACTCHECK_SEARCH_POOL_SIZE,
    });
    searchTargets = pool;
    rotates = true;
  }

  stats.searchPoolSize = searchTargets.length;

  if (limit) {
    if (rotates) {
      // Resume where the previous run stopped so successive runs walk the pool
      // instead of re-querying its head forever.
      stats.rotationOffset = (await readRotationOffset()) % Math.max(searchTargets.length, 1);
      nextRotationOffset = (stats.rotationOffset + limit) % Math.max(searchTargets.length, 1);
      searchTargets = rotateWindow(searchTargets, stats.rotationOffset, limit);
    } else {
      searchTargets = searchTargets.slice(0, limit);
    }
  }

  for (const target of searchTargets) {
    stats.politiciansSearched++;

    try {
      const claims = await searchClaims(target.fullName);
      stats.claimsFound += claims.length;

      for (const claim of claims) {
        for (const review of claim.claimReview) {
          // Check if already exists by URL
          if (!force) {
            const existing = await db.factCheck.findUnique({
              where: { sourceUrl: review.url },
            });
            if (existing) {
              stats.factChecksSkipped++;
              continue;
            }
          }

          // Find all politician mentions in the claim text + title
          const searchText = `${claim.text} ${review.title} ${claim.claimant || ""}`;
          const rawMentions = findMentions(searchText, allPoliticians);
          const mentions = rawMentions.filter((m) => {
            if (blocklist.isBlocked(m.matchedName, m.politicianId)) {
              stats.mentionsBlocked++;
              return false;
            }
            return true;
          });

          // If no politician matched, at least link to the target
          if (mentions.length === 0) {
            mentions.push({
              politicianId: target.id,
              matchedName: target.fullName,
            });
          }

          // Determine which mentioned politicians are the actual claimant
          const claimantIds = computeClaimantIds(claim.claimant, allPoliticians, blocklist);

          const verdictRating = mapTextualRating(review.textualRating);
          const reviewDate = review.reviewDate ? new Date(review.reviewDate) : new Date();
          // Fold the publisher name onto its canonical label before it is
          // stored: the public listing and the source facet both match on the
          // exact string, so a variant spelling would be invisible on one and
          // a duplicate entry on the other.
          const source = canonicalizeFactCheckSource(review.publisher.name);

          // Fetch full title from source page when Google API truncates it
          let title = review.title;
          if (title.endsWith("...") || title.endsWith("…")) {
            title = await fetchPageTitle(review.url, title);
          }

          // Check for existing fact-check with same title (catch URL variants)
          if (!force) {
            const existingByTitle = await db.factCheck.findFirst({
              where: { title: { equals: title, mode: "insensitive" } },
            });
            if (existingByTitle) {
              // Merge mentions if needed
              if (!dryRun) {
                for (const m of mentions) {
                  const mentionExists = await db.factCheckMention.findUnique({
                    where: {
                      factCheckId_politicianId: {
                        factCheckId: existingByTitle.id,
                        politicianId: m.politicianId,
                      },
                    },
                  });
                  if (!mentionExists) {
                    await db.factCheckMention.create({
                      data: {
                        factCheckId: existingByTitle.id,
                        politicianId: m.politicianId,
                        matchedName: m.matchedName,
                        isClaimant: claimantIds.has(m.politicianId),
                      },
                    });
                  }
                }
              }
              stats.factChecksSkipped++;
              continue;
            }
          }

          if (dryRun) {
            stats.factChecksCreated++;
            stats.mentionsCreated += mentions.length;
          } else {
            try {
              if (force) {
                await db.factCheck.upsert({
                  where: { sourceUrl: review.url },
                  update: {
                    claimText: claim.text,
                    claimant: claim.claimant || null,
                    title,
                    verdict: review.textualRating,
                    verdictRating,
                    source,
                    publishedAt: reviewDate,
                    claimDate: claim.claimDate ? new Date(claim.claimDate) : null,
                    languageCode: review.languageCode || null,
                    mentions: {
                      deleteMany: {},
                      create: mentions.map((m) => ({
                        politicianId: m.politicianId,
                        matchedName: m.matchedName,
                        isClaimant: claimantIds.has(m.politicianId),
                      })),
                    },
                  },
                  create: {
                    slug: await generateUniqueFactCheckSlug(reviewDate, title),
                    claimText: claim.text,
                    claimant: claim.claimant || null,
                    title,
                    verdict: review.textualRating,
                    verdictRating,
                    source,
                    sourceUrl: review.url,
                    publishedAt: reviewDate,
                    claimDate: claim.claimDate ? new Date(claim.claimDate) : null,
                    languageCode: review.languageCode || null,
                    publicationStatus: getPublicationStatusForSource(source),
                    mentions: {
                      create: mentions.map((m) => ({
                        politicianId: m.politicianId,
                        matchedName: m.matchedName,
                        isClaimant: claimantIds.has(m.politicianId),
                      })),
                    },
                  },
                });
              } else {
                await db.factCheck.create({
                  data: {
                    slug: await generateUniqueFactCheckSlug(reviewDate, title),
                    claimText: claim.text,
                    claimant: claim.claimant || null,
                    title,
                    verdict: review.textualRating,
                    verdictRating,
                    source,
                    sourceUrl: review.url,
                    publishedAt: reviewDate,
                    claimDate: claim.claimDate ? new Date(claim.claimDate) : null,
                    languageCode: review.languageCode || null,
                    publicationStatus: getPublicationStatusForSource(source),
                    mentions: {
                      create: mentions.map((m) => ({
                        politicianId: m.politicianId,
                        matchedName: m.matchedName,
                        isClaimant: claimantIds.has(m.politicianId),
                      })),
                    },
                  },
                });
              }

              stats.factChecksCreated++;
              stats.mentionsCreated += mentions.length;
            } catch (error) {
              if (error instanceof Error && error.message.includes("Unique constraint")) {
                stats.factChecksSkipped++;
              } else {
                throw error;
              }
            }
          }
        }
      }
    } catch (error) {
      stats.apiErrors++;
      stats.errors.push(`Error searching "${target.fullName}": ${error}`);
    }

    // Rate limiting between politician searches
    await sleep(FACTCHECK_RATE_LIMIT_MS);
  }

  // Advance the cursor even when some searches errored: the slice was spent,
  // and replaying it would stall the rotation on whichever politician the API
  // is currently unhappy about. The next pass comes back round in a few days.
  if (nextRotationOffset !== null && !dryRun) {
    await syncMetadata.set(FACTCHECK_ROTATION_KEY, { cursor: String(nextRotationOffset) });
  }

  return stats;
}
