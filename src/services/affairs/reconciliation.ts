/**
 * Affair Reconciliation Service
 *
 * Detects potential duplicates between affairs created by different sources,
 * allows merging them, and tracks dismissed false positives.
 */

import { db } from "@/lib/db";
import { Prisma, type SourceType } from "@/generated/prisma";
import { findMatchingAffairs, type MatchConfidence } from "./matching";

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

  // Sort by score descending (most confident first)
  duplicates.sort((a, b) => b.score - a.score);
  return duplicates;
}

// ============================================
// MERGE
// ============================================

/**
 * Merge two affairs: keep affairA, transfer data from affairB, delete affairB.
 *
 * Transfers: sources, events, press article links.
 * Does NOT merge text fields (title, description) — admin should edit after.
 */
export async function mergeAffairs(keepId: string, removeId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    // Verify both affairs exist and capture publicIds for redirect bookkeeping.
    const [keep, remove] = await Promise.all([
      tx.affair.findUnique({
        where: { id: keepId },
        select: { id: true, publicId: true },
      }),
      tx.affair.findUnique({
        where: { id: removeId },
        select: { id: true, publicId: true },
      }),
    ]);
    if (!keep) throw new Error(`Affair to keep not found: ${keepId}`);
    if (!remove) throw new Error(`Affair to remove not found: ${removeId}`);

    // Transfer sources (skip duplicates by URL)
    const existingSources = await tx.source.findMany({
      where: { affairId: keepId },
      select: { url: true },
    });
    const existingUrls = new Set(existingSources.map((s) => s.url));

    const sourcesToTransfer = await tx.source.findMany({
      where: { affairId: removeId },
    });
    for (const source of sourcesToTransfer) {
      if (!existingUrls.has(source.url)) {
        await tx.source.update({
          where: { id: source.id },
          data: { affairId: keepId },
        });
      }
    }

    // Transfer events
    await tx.affairEvent.updateMany({
      where: { affairId: removeId },
      data: { affairId: keepId },
    });

    // Transfer press article links (skip duplicates)
    const existingLinks = await tx.pressArticleAffair.findMany({
      where: { affairId: keepId },
      select: { articleId: true },
    });
    const existingArticleIds = new Set(existingLinks.map((l) => l.articleId));

    const linksToTransfer = await tx.pressArticleAffair.findMany({
      where: { affairId: removeId },
    });
    for (const link of linksToTransfer) {
      if (!existingArticleIds.has(link.articleId)) {
        await tx.pressArticleAffair.update({
          where: { id: link.id },
          data: { affairId: keepId },
        });
      }
    }

    // Merge judicial identifiers if the kept affair is missing them
    const removeAffair = await tx.affair.findUnique({
      where: { id: removeId },
      select: { ecli: true, pourvoiNumber: true, caseNumbers: true },
    });
    const keepAffair = await tx.affair.findUnique({
      where: { id: keepId },
      select: { ecli: true, pourvoiNumber: true, caseNumbers: true },
    });
    if (removeAffair && keepAffair) {
      const updates: Prisma.AffairUpdateInput = {};
      if (!keepAffair.ecli && removeAffair.ecli) {
        updates.ecli = removeAffair.ecli;
      }
      if (!keepAffair.pourvoiNumber && removeAffair.pourvoiNumber) {
        updates.pourvoiNumber = removeAffair.pourvoiNumber;
      }
      if (removeAffair.caseNumbers.length > 0) {
        const merged = new Set([...keepAffair.caseNumbers, ...removeAffair.caseNumbers]);
        updates.caseNumbers = Array.from(merged);
      }
      if (Object.keys(updates).length > 0) {
        await tx.affair.update({ where: { id: keepId }, data: updates });
      }
    }

    // Delete the merged affair (cascades sources, events, press links that weren't transferred)
    await tx.affair.delete({ where: { id: removeId } });

    // Preserve the retired poligraphId as a redirect so external citations
    // keep resolving to the survivor. Written inside the transaction so the
    // redirect and deletion commit or roll back together.
    if (remove.publicId && keep.publicId && remove.publicId !== keep.publicId) {
      await tx.publicIdRedirect.upsert({
        where: { fromPublicId: remove.publicId },
        create: {
          fromPublicId: remove.publicId,
          toPublicId: keep.publicId,
          entityType: "affair",
          reason: "merged",
        },
        update: {
          toPublicId: keep.publicId,
          reason: "merged",
        },
      });
    }

    // Clean up any dismissed duplicates referencing the removed affair
    await tx.dismissedDuplicate.deleteMany({
      where: {
        OR: [{ affairIdA: removeId }, { affairIdB: removeId }],
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        action: "MERGE",
        entityType: "Affair",
        entityId: keepId,
        changes: { mergedFrom: removeId },
      },
    });
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
