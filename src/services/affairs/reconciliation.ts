/**
 * Affair Reconciliation Service
 *
 * Detects potential duplicates between affairs created by different sources,
 * allows merging them, and tracks dismissed false positives.
 */

import { db } from "@/lib/db";
import { Prisma, type SourceType } from "@/generated/prisma";
import { findMatchingAffairs, sameCategoryFamily, type MatchConfidence } from "./matching";

// ============================================
// TYPES
// ============================================

export interface AffairSummary {
  id: string;
  title: string;
  sources: SourceType[];
}

export interface PotentialDuplicate {
  affairA: AffairSummary;
  affairB: AffairSummary;
  confidence: MatchConfidence;
  matchedBy: string;
  score: number;
}

export interface ReconciliationStats {
  totalUnverified: number;
  totalDuplicates: number;
  duplicatesByCertainty: Record<MatchConfidence, number>;
  totalDismissed: number;
}

// ============================================
// DUPLICATE DETECTION
// ============================================

/**
 * Window (in days) for clustering DRAFT affairs of the same politician.
 * Press sync waves spread coverage of a single event over up to two weeks.
 */
const DRAFT_CLUSTER_WINDOW_DAYS = 14;

/**
 * Find potential duplicate pairs among unverified affairs.
 *
 * Groups affairs by politician, then compares each pair using
 * the existing matching algorithm.
 */
export async function findPotentialDuplicates(): Promise<PotentialDuplicate[]> {
  // Load all unverified affairs
  const affairs = await db.affair.findMany({
    where: { verifiedAt: null },
    select: {
      id: true,
      title: true,
      ecli: true,
      pourvoiNumber: true,
      caseNumbers: true,
      category: true,
      verdictDate: true,
      politicianId: true,
      createdAt: true,
      publicationStatus: true,
      sources: { select: { sourceType: true } },
    },
  });

  // Load dismissed pairs to exclude
  const dismissed = await db.dismissedDuplicate.findMany({
    select: { affairIdA: true, affairIdB: true },
  });
  const dismissedSet = new Set(dismissed.map((d) => [d.affairIdA, d.affairIdB].sort().join(":")));

  // Group by politician
  const byPolitician = new Map<string, typeof affairs>();
  for (const affair of affairs) {
    const list = byPolitician.get(affair.politicianId) ?? [];
    list.push(affair);
    byPolitician.set(affair.politicianId, list);
  }

  const duplicates: PotentialDuplicate[] = [];

  for (const group of byPolitician.values()) {
    if (group.length < 2) continue;

    // Compare each pair within the same politician
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Skip if already dismissed
        const pairKey = [a!.id, b!.id].sort().join(":");
        if (dismissedSet.has(pairKey)) continue;

        // Use affair B as a candidate to match against A
        const matches = await findMatchingAffairs({
          politicianId: b!.politicianId,
          title: b!.title,
          ecli: b!.ecli,
          pourvoiNumber: b!.pourvoiNumber,
          caseNumbers: b!.caseNumbers,
          category: b!.category,
          verdictDate: b!.verdictDate,
        });

        // Check if affair A appears in the matches
        const matchForA = matches.find((m) => m.affairId === a!.id);
        if (matchForA) {
          duplicates.push({
            affairA: {
              id: a!.id,
              title: a!.title,
              sources: [...new Set(a!.sources.map((s) => s.sourceType))],
            },
            affairB: {
              id: b!.id,
              title: b!.title,
              sources: [...new Set(b!.sources.map((s) => s.sourceType))],
            },
            confidence: matchForA.confidence,
            matchedBy: matchForA.matchedBy,
            score: matchForA.score,
          });
        }
      }
    }
  }

  // Second pass — DRAFT clustering by creation window.
  // Drafts from the same news event are imported over a few days with
  // divergent titles and sibling categories (e.g. 13 drafts for the same
  // Le Havre investigation), which the identifier/title matching above
  // cannot catch. Pair drafts of the same politician created within
  // DRAFT_CLUSTER_WINDOW_DAYS when their categories share a family.
  // POSSIBLE only (score 0.45): never auto-merged, surfaced for human review.
  const foundPairs = new Set(duplicates.map((d) => [d.affairA.id, d.affairB.id].sort().join(":")));

  for (const group of byPolitician.values()) {
    const draftGroup = group.filter((a) => a.publicationStatus === "DRAFT");
    if (draftGroup.length < 2) continue;

    for (let i = 0; i < draftGroup.length; i++) {
      for (let j = i + 1; j < draftGroup.length; j++) {
        const a = draftGroup[i]!;
        const b = draftGroup[j]!;

        const pairKey = [a.id, b.id].sort().join(":");
        if (dismissedSet.has(pairKey) || foundPairs.has(pairKey)) continue;

        const daysApart =
          Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysApart > DRAFT_CLUSTER_WINDOW_DAYS) continue;
        if (!sameCategoryFamily(a.category, b.category)) continue;

        foundPairs.add(pairKey);
        duplicates.push({
          affairA: {
            id: a.id,
            title: a.title,
            sources: [...new Set(a.sources.map((s) => s.sourceType))],
          },
          affairB: {
            id: b.id,
            title: b.title,
            sources: [...new Set(b.sources.map((s) => s.sourceType))],
          },
          confidence: "POSSIBLE",
          matchedBy: "politician+category+window",
          score: 0.45,
        });
      }
    }
  }

  // Sort by score descending (most confident first)
  duplicates.sort((a, b) => b.score - a.score);
  return duplicates;
}

// ============================================
// MERGE
// ============================================

/**
 * Fields filled on the survivor only when it does not already carry a value.
 * Purely additive: a merge must never overwrite what the survivor states, but
 * losing what the absorbed affair stated is data loss, since its row is deleted.
 */
const ADDITIVE_MERGE_FIELDS = ["ecli", "pourvoiNumber", "court", "chamber", "caseNumber"] as const;

export interface MergeAffairsOptions {
  /** Request context, when the merge is human-initiated from the admin. */
  audit?: { ipAddress?: string | null; userAgent?: string | null };
}

export interface MergeAffairsResult {
  sourcesMoved: number;
  eventsMoved: number;
  articlesMoved: number;
  identifiersMerged: string[];
  /** Slugs the survivor now answers to on behalf of the absorbed affair. */
  slugsPreserved: string[];
}

/** Semantic identity of an event: it carries no unique constraint in the schema. */
function eventKey(event: { date: Date; type: string; title: string }): string {
  return [event.date.toISOString(), event.type, event.title].join("|");
}

/**
 * Slugs the survivor must start answering to once the absorbed affair is deleted.
 *
 * Deleting the row frees its `slug`, so every URL form it served has to move to
 * the survivor's `oldSlugs`, which `buildPublicAffairLookupWheres` resolves.
 * Excludes the survivor's own canonical slug — listing it as a former slug would
 * make the affair shadow itself — and anything it already answers to.
 */
export function computePreservedSlugs(input: {
  keepSlug: string;
  keepOldSlugs: string[];
  removeSlug: string;
  removeOldSlugs: string[];
}): string[] {
  const alreadyServed = new Set([input.keepSlug, ...input.keepOldSlugs]);
  return [...new Set([input.removeSlug, ...input.removeOldSlugs])].filter(
    (slug) => !alreadyServed.has(slug)
  );
}

/**
 * Merge two affairs: keep `keepId`, transfer what `removeId` holds, delete it.
 *
 * The single merge implementation. Everything runs in one transaction so a
 * failure can never leave sources moved with the affair still present, nor an
 * affair deleted without its redirects.
 *
 * Transfers additively: sources, events, press article links, and the judicial
 * identifiers the survivor is missing. Never touches the survivor's editorial
 * fields (title, description, status, dates, sentence) — those are a human
 * decision, and for automated paths they belong in an AffairUpdateProposal.
 *
 * Preserves both URL forms of the absorbed affair, since deleting its row frees
 * its slug: the retired publicId gets a redirect row, and its slug plus any slug
 * it previously answered to move into the survivor's `oldSlugs`, which
 * `buildPublicAffairLookupWheres` resolves (issue #525).
 */
export async function mergeAffairs(
  keepId: string,
  removeId: string,
  options: MergeAffairsOptions = {}
): Promise<MergeAffairsResult> {
  return db.$transaction(async (tx) => {
    const affairSelect = {
      id: true,
      title: true,
      slug: true,
      publicId: true,
      oldSlugs: true,
      politicianId: true,
      ecli: true,
      pourvoiNumber: true,
      caseNumbers: true,
      court: true,
      chamber: true,
      caseNumber: true,
    } as const;

    const [keep, remove] = await Promise.all([
      tx.affair.findUnique({ where: { id: keepId }, select: affairSelect }),
      tx.affair.findUnique({ where: { id: removeId }, select: affairSelect }),
    ]);
    if (!keep) throw new Error(`Affair to keep not found: ${keepId}`);
    if (!remove) throw new Error(`Affair to remove not found: ${removeId}`);

    // --- Sources: unique on (affairId, url), so skip URLs already present.
    const existingSources = await tx.source.findMany({
      where: { affairId: keepId },
      select: { url: true },
    });
    const existingUrls = new Set(existingSources.map((s) => s.url));

    const sourcesToTransfer = await tx.source.findMany({
      where: { affairId: removeId },
      select: { id: true, url: true },
    });
    let sourcesMoved = 0;
    for (const source of sourcesToTransfer) {
      if (existingUrls.has(source.url)) continue;
      await tx.source.update({ where: { id: source.id }, data: { affairId: keepId } });
      existingUrls.add(source.url);
      sourcesMoved++;
    }

    // --- Events: no unique constraint, so deduplicate on their semantic key.
    const existingEvents = await tx.affairEvent.findMany({
      where: { affairId: keepId },
      select: { date: true, type: true, title: true },
    });
    const existingEventKeys = new Set(existingEvents.map(eventKey));

    const eventsToTransfer = await tx.affairEvent.findMany({
      where: { affairId: removeId },
      select: { id: true, date: true, type: true, title: true },
    });
    let eventsMoved = 0;
    for (const event of eventsToTransfer) {
      const key = eventKey(event);
      if (existingEventKeys.has(key)) continue;
      await tx.affairEvent.update({ where: { id: event.id }, data: { affairId: keepId } });
      existingEventKeys.add(key);
      eventsMoved++;
    }

    // --- Press links: unique on (articleId, affairId), so a blanket move would throw.
    const existingLinks = await tx.pressArticleAffair.findMany({
      where: { affairId: keepId },
      select: { articleId: true },
    });
    const existingArticleIds = new Set(existingLinks.map((l) => l.articleId));

    const linksToTransfer = await tx.pressArticleAffair.findMany({
      where: { affairId: removeId },
      select: { id: true, articleId: true },
    });
    let articlesMoved = 0;
    for (const link of linksToTransfer) {
      if (existingArticleIds.has(link.articleId)) continue;
      await tx.pressArticleAffair.update({
        where: { id: link.id },
        data: { affairId: keepId },
      });
      existingArticleIds.add(link.articleId);
      articlesMoved++;
    }

    // --- Additive field fill, plus the absorbed affair's URLs.
    const updates: Prisma.AffairUpdateInput = {};
    const identifiersMerged: string[] = [];
    for (const field of ADDITIVE_MERGE_FIELDS) {
      if (!keep[field] && remove[field]) {
        updates[field] = remove[field];
        identifiersMerged.push(field);
      }
    }
    if (remove.caseNumbers.length > 0) {
      const merged = [...new Set([...keep.caseNumbers, ...remove.caseNumbers])];
      if (merged.length !== keep.caseNumbers.length) {
        updates.caseNumbers = merged;
        identifiersMerged.push("caseNumbers");
      }
    }

    const slugsPreserved = computePreservedSlugs({
      keepSlug: keep.slug,
      keepOldSlugs: keep.oldSlugs,
      removeSlug: remove.slug,
      removeOldSlugs: remove.oldSlugs,
    });
    if (slugsPreserved.length > 0) {
      updates.oldSlugs = [...keep.oldSlugs, ...slugsPreserved];
    }

    if (Object.keys(updates).length > 0) {
      await tx.affair.update({ where: { id: keepId }, data: updates });
    }

    // Cascades whatever was not transferred above.
    await tx.affair.delete({ where: { id: removeId } });

    // The retired poligraphId keeps resolving for external citations.
    if (remove.publicId && keep.publicId && remove.publicId !== keep.publicId) {
      await tx.publicIdRedirect.upsert({
        where: { fromPublicId: remove.publicId },
        create: {
          fromPublicId: remove.publicId,
          toPublicId: keep.publicId,
          entityType: "affair",
          reason: "merged",
        },
        update: { toPublicId: keep.publicId, reason: "merged" },
      });
    }

    await tx.dismissedDuplicate.deleteMany({
      where: { OR: [{ affairIdA: removeId }, { affairIdB: removeId }] },
    });

    await tx.auditLog.create({
      data: {
        action: "MERGE",
        entityType: "Affair",
        entityId: keepId,
        changes: {
          mergedFrom: removeId,
          mergedFromTitle: remove.title,
          sourcesMoved,
          eventsMoved,
          articlesMoved,
          identifiersMerged,
          slugsPreserved,
        },
        ipAddress: options.audit?.ipAddress ?? null,
        userAgent: options.audit?.userAgent ?? null,
      },
    });

    return { sourcesMoved, eventsMoved, articlesMoved, identifiersMerged, slugsPreserved };
  });
}

// ============================================
// DISMISS
// ============================================

/**
 * Mark a pair of affairs as "not a duplicate" so they won't be re-proposed.
 */
export async function dismissDuplicate(affairIdA: string, affairIdB: string): Promise<void> {
  // Always store with sorted IDs to avoid duplicates
  const [idA, idB] = [affairIdA, affairIdB].sort();
  await db.dismissedDuplicate.upsert({
    where: { affairIdA_affairIdB: { affairIdA: idA!, affairIdB: idB! } },
    create: { affairIdA: idA!, affairIdB: idB! },
    update: {},
  });
}

// ============================================
// STATS
// ============================================

/**
 * Get reconciliation statistics.
 */
export async function getReconciliationStats(): Promise<ReconciliationStats> {
  const [totalUnverified, totalDismissed] = await Promise.all([
    db.affair.count({ where: { verifiedAt: null } }),
    db.dismissedDuplicate.count(),
  ]);

  const duplicates = await findPotentialDuplicates();
  const duplicatesByCertainty: Record<MatchConfidence, number> = {
    CERTAIN: 0,
    HIGH: 0,
    POSSIBLE: 0,
  };
  for (const d of duplicates) {
    duplicatesByCertainty[d.confidence]++;
  }

  return {
    totalUnverified,
    totalDuplicates: duplicates.length,
    duplicatesByCertainty,
    totalDismissed,
  };
}
