import { db } from "@/lib/db";
import { checkPublishable, type PublishBlockReason } from "@/lib/affairs/publish-guard";
import type { PublicationStatus } from "@/generated/prisma";

/**
 * Which affairs a moderator actually has to unblock.
 *
 * The dashboard used to show two counters, « en attente de revue » and « sans
 * candidat », and neither answers the only question that matters: what do I have
 * to do today? Measured on the live base, 1800 unreviewed decisions came down to
 * 26 that hold up a publication. A counter that large reads as a wall and hides
 * the work behind it.
 *
 * **The guard is the authority, not this file.** A cheap query narrows the field
 * to affairs a decision could plausibly reach, then `checkPublishable` decides.
 * The alternative, reimplementing the guard's predicate to answer in one query,
 * was tried elsewhere today and drifted within the hour: the same reasoning that
 * looked complete missed rows that would *start* blocking after a write.
 */

/** Guard calls run in waves; the pool is sized for a serverless function. */
const GUARD_CONCURRENCY = 8;

export interface BlockedAffair {
  id: string;
  slug: string;
  title: string;
  publicationStatus: PublicationStatus;
  politicianName: string;
  /** Decision ids the moderator has to settle, from the guard itself. */
  decisionIds: string[];
  /** Guard message per matching-related reason, shown as-is. */
  messages: string[];
  /**
   * Non-matching reasons on the same affair, named so the page does not promise
   * that settling the attributions is enough to publish.
   */
  otherBlockers: string[];
}

/** Reasons this page is about: the ones the attribution panel can resolve. */
function isMatchingReason(
  reason: PublishBlockReason
): reason is Extract<PublishBlockReason, { decisionIds: string[] }> {
  return "decisionIds" in reason;
}

/**
 * Affairs held up by an unsettled attribution, newest activity first.
 *
 * Only DRAFT and PUBLISHED are considered. A REJECTED affair cannot be published
 * without changing its status first, which runs the guard again from scratch, so
 * listing it would be busywork.
 */
export async function loadBlockedAffairs(): Promise<BlockedAffair[]> {
  // Deliberately over-inclusive: every decision that carries a link the guard
  // could follow. Filtering precisely here would mean copying the guard.
  const decisions = await db.affairPoliticianDecision.findMany({
    where: {
      judgment: { in: ["SAME", "UNDECIDED"] },
      OR: [{ affairId: { not: null } }, { chosenPoliticianId: { not: null } }],
    },
    select: { affairId: true, chosenPoliticianId: true, sourceRef: true },
  });

  const affairIds = new Set<string>();
  for (const d of decisions) if (d.affairId) affairIds.add(d.affairId);

  // Orphan decisions reach an affair through the guard's fallback: same
  // politician, and a sourceRef equal to one of the affair's source URLs.
  const orphanRefs = [
    ...new Set(
      decisions.filter((d) => !d.affairId && d.sourceRef.length > 0).map((d) => d.sourceRef)
    ),
  ];
  if (orphanRefs.length > 0) {
    const sources = await db.source.findMany({
      where: { url: { in: orphanRefs } },
      select: { url: true, affairId: true, affair: { select: { politicianId: true } } },
    });
    const byUrl = new Map<string, { affairId: string; politicianId: string }[]>();
    for (const s of sources) {
      const list = byUrl.get(s.url) ?? [];
      list.push({ affairId: s.affairId, politicianId: s.affair.politicianId });
      byUrl.set(s.url, list);
    }
    for (const d of decisions) {
      if (d.affairId || !d.chosenPoliticianId) continue;
      for (const hit of byUrl.get(d.sourceRef) ?? []) {
        if (hit.politicianId === d.chosenPoliticianId) affairIds.add(hit.affairId);
      }
    }
  }

  if (affairIds.size === 0) return [];

  const affairs = await db.affair.findMany({
    where: { id: { in: [...affairIds] }, publicationStatus: { in: ["DRAFT", "PUBLISHED"] } },
    select: {
      id: true,
      slug: true,
      title: true,
      publicationStatus: true,
      updatedAt: true,
      politician: { select: { fullName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Two queries each, run in small waves: sequential took 7.6s on the live base,
  // which is long enough that the page would feel broken.
  const blocked: BlockedAffair[] = [];
  for (let i = 0; i < affairs.length; i += GUARD_CONCURRENCY) {
    const wave = await Promise.all(
      affairs.slice(i, i + GUARD_CONCURRENCY).map(async (affair) => {
        const reasons = await checkPublishable(affair.id);
        const matching = reasons.filter(isMatchingReason);
        if (matching.length === 0) return null;

        return {
          id: affair.id,
          slug: affair.slug,
          title: affair.title,
          publicationStatus: affair.publicationStatus,
          politicianName: affair.politician.fullName,
          decisionIds: matching.flatMap((r) => r.decisionIds),
          messages: matching.map((r) => r.message),
          otherBlockers: reasons.filter((r) => !isMatchingReason(r)).map((r) => r.message),
        } satisfies BlockedAffair;
      })
    );
    for (const entry of wave) if (entry) blocked.push(entry);
  }

  return blocked;
}
