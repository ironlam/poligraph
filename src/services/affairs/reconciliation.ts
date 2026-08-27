/**
 * Affair Reconciliation Service
 *
 * Detects potential duplicates between affairs created by different sources,
 * allows merging them, and tracks dismissed false positives.
 */

import { db, type DbTransactionClient } from "@/lib/db";
import { canonicalPair } from "./affair-pair";
import { buildPairDecisionUpsert, loadPairExclusions } from "./pair-decision";
import {
  Prisma,
  type AffairCategory,
  type AffairPairClassification,
  type PublicationStatus,
  type SourceType,
} from "@/generated/prisma";
import { absorbedAffairSelect, buildAbsorbedSnapshot } from "./absorbed-snapshot";
import {
  findMatchingAffairs,
  pairingRestsOnWildcard,
  sameCategoryFamily,
  titlesShareVocabulary,
  verdictDatesConflict,
  type MatchConfidence,
  type MatchResult,
} from "./matching";

// ============================================
// TYPES
// ============================================

export interface AffairSummary {
  id: string;
  title: string;
  /** Both sides always share it; carried so the queue can group by person. */
  politicianId: string;
  sources: SourceType[];
  /** Carried so a ruling can record the rows it was made against. */
  updatedAt: Date;
  /** Needed by decideMergeAction: automation stops at the published boundary. */
  publicationStatus: PublicationStatus;
  /** A verified affair is never deleted automatically (issue #525). */
  verifiedAt: Date | null;
}

export interface PotentialDuplicate {
  affairA: AffairSummary;
  affairB: AffairSummary;
  confidence: MatchConfidence;
  matchedBy: string;
  score: number;
  /** Judicial values that rule out the two rows describing one decision. */
  contradictions: string[];
  /** Differences a merge could neither write nor turn into a proposal. */
  unpropagatableDifferences: string[];
  /** An earlier human ruling on this pair, when one no longer excludes it. */
  previousClassification: AffairPairClassification | null;
  /** True when that ruling was made against rows that have since been edited. */
  rulingStale: boolean;
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
 * Statuses duplicate detection covers.
 *
 * Named explicitly rather than expressed as "everything except rejected", so
 * adding a status to the enum cannot silently widen the queue. Left out for this
 * lot: REJECTED (a moderator already ruled), EXCLUDED (a wrong exclusion is a
 * moderation audit, not duplicate detection) and ARCHIVED (needs the reason for
 * archiving to be read). Auditing those is a separate historical pass.
 */
const DETECTED_PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED"] as const;

type DetectedAffair = {
  id: string;
  title: string;
  /** Références des décisions rattachées (#545), et non des colonnes de l'affaire. */
  courtDecisions: Array<{
    courtDecision: { ecli: string | null; pourvoiNumber: string | null };
  }>;
  category: string;
  involvement: string;
  factsDate: Date | null;
  verdictDate: Date | null;
  politicianId: string;
  createdAt: Date;
  publicationStatus: PublicationStatus;
  verifiedAt: Date | null;
  updatedAt: Date;
  sources: { sourceType: SourceType }[];
};

/** Le jeu de références portées par les décisions rattachées à une affaire. */
function decisionRefs(affair: DetectedAffair, field: "ecli" | "pourvoiNumber"): Set<string> {
  const refs = new Set<string>();
  for (const link of affair.courtDecisions) {
    const value = link.courtDecision[field];
    if (value) refs.add(value);
  }
  return refs;
}

/**
 * Judicial values that rule out the two rows being one decision.
 *
 * Lues depuis les décisions rattachées (#545). La contradiction porte sur des
 * ensembles disjoints : deux fiches citant chacune une décision, et **aucune en
 * commun**, ne décrivent pas la même décision. Partager une référence n'est en
 * revanche pas une preuve de doublon, c'est ce que #557 verrouille.
 */
function findContradictions(a: DetectedAffair, b: DetectedAffair): string[] {
  const contradictions: string[] = [];
  if (verdictDatesConflict(a.verdictDate, b.verdictDate)) contradictions.push("verdictDate");

  for (const field of ["ecli", "pourvoiNumber"] as const) {
    const refsA = decisionRefs(a, field);
    const refsB = decisionRefs(b, field);
    if (refsA.size === 0 || refsB.size === 0) continue;
    const shared = [...refsA].some((ref) => refsB.has(ref));
    if (!shared) contradictions.push(field);
  }

  return contradictions;
}

/**
 * Differences a merge could neither write nor propose, so absorbing would drop
 * the claim in silence.
 *
 * `involvement` says what the person is accused of being, and `factsDate` says
 * when: both are outside the proposal whitelist, so a disagreement has to stop
 * automation. Title, description and category are left out on purpose — the
 * surviving published fiche is the authoritative wording, and the merge audit
 * trail records what the absorbed row said.
 */
function findUnpropagatableDifferences(a: DetectedAffair, b: DetectedAffair): string[] {
  const differences: string[] = [];
  if (a.involvement !== b.involvement) differences.push("involvement");
  const factsA = a.factsDate?.getTime() ?? null;
  const factsB = b.factsDate?.getTime() ?? null;
  if (factsA !== null && factsB !== null && factsA !== factsB) differences.push("factsDate");
  return differences;
}

function toSummary(affair: DetectedAffair): AffairSummary {
  return {
    id: affair.id,
    title: affair.title,
    politicianId: affair.politicianId,
    sources: [...new Set(affair.sources.map((s) => s.sourceType))],
    updatedAt: affair.updatedAt,
    publicationStatus: affair.publicationStatus,
    verifiedAt: affair.verifiedAt,
  };
}

/**
 * Find potential duplicate pairs among drafts and published affairs.
 *
 * Verifying an affair used to remove it from detection for good, which hid every
 * duplicate involving a published fiche — the blind spot of issue #525. Scope is
 * now publication status, not review state.
 *
 * Widening the outer loop made the previous shape untenable: findMatchingAffairs
 * was called once per pair although it only depends on one side, so a politician
 * with n affairs cost n(n-1)/2 calls where n suffice. It is now called once per
 * affair and the results are folded into pairs.
 */
export async function findPotentialDuplicates(): Promise<PotentialDuplicate[]> {
  const affairs = await db.affair.findMany({
    where: { publicationStatus: { in: [...DETECTED_PUBLICATION_STATUSES] } },
    select: {
      id: true,
      title: true,
      // Les références viennent des décisions rattachées, plus des colonnes de
      // l'affaire, qui ne sont plus alimentées (#545).
      courtDecisions: {
        select: { courtDecision: { select: { ecli: true, pourvoiNumber: true } } },
      },
      category: true,
      involvement: true,
      factsDate: true,
      verdictDate: true,
      politicianId: true,
      createdAt: true,
      publicationStatus: true,
      verifiedAt: true,
      updatedAt: true,
      sources: { select: { sourceType: true } },
    },
  });

  // Rulings are checked against the rows as they stand: a DISTINCT made before an
  // edit no longer settles anything (issue #525).
  const exclusions = await loadPairExclusions(new Map(affairs.map((a) => [a.id, a.updatedAt])));

  const byId = new Map(affairs.map((a) => [a.id, a as DetectedAffair]));

  const byPolitician = new Map<string, DetectedAffair[]>();
  for (const affair of affairs) {
    const list = byPolitician.get(affair.politicianId) ?? [];
    list.push(affair as DetectedAffair);
    byPolitician.set(affair.politicianId, list);
  }

  // Best result per pair. Both sides of a pair can produce a match, and they can
  // disagree, so the winner is picked on score then on matchedBy — never on which
  // side was queried first, which would make the output order-dependent.
  const best = new Map<string, PotentialDuplicate>();

  function record(a: DetectedAffair, b: DetectedAffair, match: MatchResult) {
    const { a: idA, key } = canonicalPair(a.id, b.id);
    if (exclusions.excluded.has(key)) return;

    const first = idA === a.id ? a : b;
    const second = idA === a.id ? b : a;
    const candidate: PotentialDuplicate = {
      affairA: toSummary(first),
      affairB: toSummary(second),
      confidence: match.confidence,
      matchedBy: match.matchedBy,
      score: match.score,
      contradictions: findContradictions(first, second),
      unpropagatableDifferences: findUnpropagatableDifferences(first, second),
      previousClassification: exclusions.classifications.get(key) ?? null,
      rulingStale: exclusions.stale.has(key),
    };

    const existing = best.get(key);
    if (
      !existing ||
      candidate.score > existing.score ||
      (candidate.score === existing.score && candidate.matchedBy < existing.matchedBy)
    ) {
      best.set(key, candidate);
    }
  }

  for (const group of byPolitician.values()) {
    if (group.length < 2) continue;

    for (const affair of group) {
      const matches = await findMatchingAffairs({
        politicianId: affair.politicianId,
        title: affair.title,
        decisionRefs: affair.courtDecisions.map((l) => l.courtDecision),
        category: affair.category as AffairCategory,
        verdictDate: affair.verdictDate,
        // Without this the affair matches itself on every identifier branch.
        excludeAffairId: affair.id,
      });

      for (const match of matches) {
        // Belt and braces: excludeAffairId already prevents this, but a self-pair
        // must never reach the queue if a matcher path ever stops honouring it.
        if (match.affairId === affair.id) continue;
        const other = byId.get(match.affairId);
        // Outside the detected scope, e.g. a rejected affair.
        if (!other) continue;
        record(affair, other, match);
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
  for (const group of byPolitician.values()) {
    const draftGroup = group.filter((a) => a.publicationStatus === "DRAFT");
    if (draftGroup.length < 2) continue;

    for (let i = 0; i < draftGroup.length; i++) {
      for (let j = i + 1; j < draftGroup.length; j++) {
        const a = draftGroup[i]!;
        const b = draftGroup[j]!;

        const { key } = canonicalPair(a.id, b.id);
        if (exclusions.excluded.has(key) || best.has(key)) continue;
        if (!sameCategoryFamily(a.category, b.category)) continue;

        // When only the AUTRE wildcard brings the categories together, the pair
        // rests on the absence of a qualification rather than on evidence. Ask the
        // titles for a second signal (issue #521): a person cited in unrelated
        // coverage otherwise pairs with every other draft about them. Measured on
        // the real base, this is exactly the one false positive the #525 triage
        // found. Downgrade only — the result stays POSSIBLE and nothing is merged.
        if (
          pairingRestsOnWildcard(a.category, b.category) &&
          !titlesShareVocabulary(a.title, b.title)
        ) {
          continue;
        }

        const daysApart =
          Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysApart > DRAFT_CLUSTER_WINDOW_DAYS) continue;

        record(a, b, {
          affairId: b.id,
          confidence: "POSSIBLE",
          score: 0.45,
          matchedBy: "politician+category+window",
        });
      }
    }
  }

  // Most confident first.
  return [...best.values()].sort((a, b) => b.score - a.score);
}

// ============================================
// MERGE
// ============================================

/**
 * Fields filled on the survivor only when it does not already carry a value.
 * Purely additive: a merge must never overwrite what the survivor states, but
 * losing what the absorbed affair stated is data loss, since its row is deleted.
 *
 * `ecli`, `pourvoiNumber` and `chamber` left this list in #545: they identify a
 * decision, not an affair, and nothing writes them on `Affair` any more. What the
 * absorbed row cited is not lost — its decision links are transferred by the merge,
 * so the survivor keeps citing the same decisions.
 */
const ADDITIVE_MERGE_FIELDS = ["court", "caseNumber"] as const;

export type AdditiveMergeField = (typeof ADDITIVE_MERGE_FIELDS)[number];

/**
 * What an absorption into a published affair may fill.
 *
 * Only `caseNumber` remains: it is an editorial reference displayed as text, and
 * filling a gap on it states nothing new about the person. `court` stays out although
 * it would only fill a gap, because it describes the jurisdiction; it is in the
 * proposal whitelist, so the draft's value reaches the published fiche through review
 * rather than a write (issue #525, §4). The decision identifiers left the list
 * entirely in #545 — they are carried by the transferred decision links.
 */
export const ABSORPTION_ADDITIVE_FIELDS: readonly AdditiveMergeField[] = ["caseNumber"];

export interface MergeAffairsOptions {
  /** Request context, when the merge is human-initiated from the admin. */
  audit?: { ipAddress?: string | null; userAgent?: string | null };
  /**
   * Restricts which fields the survivor may have filled from the absorbed affair.
   * Defaults to the full additive set, which is right for a human-initiated merge
   * and for two drafts. Absorption into a published affair narrows it.
   */
  additiveFields?: readonly AdditiveMergeField[];
  /**
   * Recorded verbatim in the merge audit trail, to keep what the absorbed affair
   * stated and could not be carried over. Nothing is dropped silently.
   */
  auditNotes?: Prisma.InputJsonValue;
  /**
   * Refuses the merge when the affair to absorb is published.
   *
   * Checked inside the transaction, not only by the caller: the row can be
   * published between a caller's precheck and this write, and a merge deletes it.
   * Callers that own an HTTP contract keep their own precheck so they can answer
   * 409 instead of surfacing an exception (issue #525).
   */
  removeMustNotBePublished?: boolean;
  /**
   * Ruling to store in the same transaction as the merge.
   *
   * A merge without its ruling would be re-proposed at the next run; a ruling
   * without its merge would claim work that never happened. Both or neither.
   */
  pairDecision?: {
    otherAffairId: string;
    reviewedBy: string;
    notes?: string | null;
    signal: { confidence: string; matchedBy: string; score: number };
    keepUpdatedAt: Date;
    removeUpdatedAt: Date;
  };
}

export interface MergeAffairsResult {
  sourcesMoved: number;
  /** Court decision links reattached to the survivor. */
  decisionLinksMoved: number;
  /** Links dropped because the survivor already cited that decision. */
  decisionLinksDeduplicated: number;
  /** Sources whose URL already existed and whose extra fields were carried over. */
  sourcesEnriched: number;
  eventsMoved: number;
  articlesMoved: number;
  identifiersMerged: string[];
  /** Slugs the survivor now answers to on behalf of the absorbed affair. */
  slugsPreserved: string[];
}

/**
 * Semantic identity of an event: it carries no unique constraint in the schema.
 *
 * Every field that holds information, not just date/type/title: two events can
 * share those three and still differ by description or by the source they cite.
 * Keying on the short triple dropped the absorbed one along with its source.
 * When anything differs, both are kept — merging their prose is a human call.
 */
function eventKey(event: {
  date: Date;
  type: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
}): string {
  return [
    event.date.toISOString(),
    event.type,
    event.title,
    event.description ?? "",
    event.sourceUrl ?? "",
    event.sourceTitle ?? "",
  ].join("|");
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
 * Transfers additively: sources, events, press article links, court decision links,
 * and the judicial identifiers the survivor is missing. A merge never deletes a
 * decision — only the absorbed affair's claim on it moves. Never touches the survivor's editorial
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
  return db.$transaction((tx) => mergeAffairsInTransaction(tx, keepId, removeId, options));
}

/**
 * The merge itself, on a caller-supplied transaction.
 *
 * Exists so a caller can widen the atomic unit. Absorbing a draft into a published
 * affair has to create its proposals in the *same* transaction as the deletion:
 * otherwise a failing proposal leaves the draft already gone, and whatever it
 * stated about the judicial outcome is lost with no trace (issue #525).
 */
export async function mergeAffairsInTransaction(
  tx: DbTransactionClient,
  keepId: string,
  removeId: string,
  options: MergeAffairsOptions = {}
): Promise<MergeAffairsResult> {
  {
    // The snapshot fields ride along: they have to be read before the row is
    // deleted, and a second query would open a window where they could change.
    const affairSelect = {
      ...absorbedAffairSelect,
      politicianId: true,
    } as const;

    const [keep, remove] = await Promise.all([
      tx.affair.findUnique({ where: { id: keepId }, select: affairSelect }),
      tx.affair.findUnique({ where: { id: removeId }, select: affairSelect }),
    ]);
    if (!keep) throw new Error(`Affair to keep not found: ${keepId}`);
    if (!remove) throw new Error(`Affair to remove not found: ${removeId}`);

    // Checked here rather than only in the callers: the cron path calls this
    // service directly. Merging an affair with itself skipped every transfer
    // (same rows on both sides), wrote no redirect (equal publicIds) and then
    // deleted the row — an outright loss.
    if (keepId === removeId) {
      throw new Error(`Une affaire ne peut pas fusionner avec elle-même : ${keepId}`);
    }
    // Affair is 1:1 with Politician, so a cross-person merge would move one
    // person's sources onto another's fiche and then delete the row.
    if (keep.politicianId !== remove.politicianId) {
      throw new Error(
        `Fusion refusée entre personnalités différentes : ${keep.politicianId} / ${remove.politicianId}`
      );
    }
    // Re-read inside the transaction: absorbing deletes the row, and a page a
    // reader can reach must not disappear because it was published a moment ago.
    if (options.removeMustNotBePublished && remove.publicationStatus === "PUBLISHED") {
      throw new Error(
        `Fusion refusée : l'affaire à absorber est publiée (${removeId}). Dépubliez-la d'abord.`
      );
    }

    // --- Sources: unique on (affairId, url), so skip URLs already present.
    const existingSources = await tx.source.findMany({
      where: { affairId: keepId },
      select: { id: true, url: true, excerpt: true, archivedUrl: true },
    });
    const keptByUrl = new Map(existingSources.map((s) => [s.url, s]));

    const sourcesToTransfer = await tx.source.findMany({
      where: { affairId: removeId },
      select: { id: true, url: true, excerpt: true, archivedUrl: true },
    });
    let sourcesMoved = 0;
    let sourcesEnriched = 0;
    for (const source of sourcesToTransfer) {
      const kept = keptByUrl.get(source.url);
      if (!kept) {
        await tx.source.update({ where: { id: source.id }, data: { affairId: keepId } });
        keptByUrl.set(source.url, { ...source });
        sourcesMoved++;
        continue;
      }
      // Same URL on both sides, so the row is not moved and will be cascaded away.
      // Whatever it documented and the kept row does not must survive that.
      // Fills only: a value already stated is never replaced.
      const fill: { excerpt?: string; archivedUrl?: string } = {};
      if (!kept.excerpt && source.excerpt) fill.excerpt = source.excerpt;
      if (!kept.archivedUrl && source.archivedUrl) fill.archivedUrl = source.archivedUrl;
      if (Object.keys(fill).length > 0) {
        await tx.source.update({ where: { id: kept.id }, data: fill });
        keptByUrl.set(source.url, { ...kept, ...fill });
        sourcesEnriched++;
      }
    }

    // --- Events: no unique constraint, so deduplicate on their semantic key.
    const existingEvents = await tx.affairEvent.findMany({
      where: { affairId: keepId },
      select: {
        date: true,
        type: true,
        title: true,
        description: true,
        sourceUrl: true,
        sourceTitle: true,
        identityKey: true,
      },
    });
    const existingEventKeys = new Set(existingEvents.map(eventKey));
    const existingEventIdentities = new Set(
      existingEvents.flatMap((event) => (event.identityKey ? [event.identityKey] : []))
    );

    const eventsToTransfer = await tx.affairEvent.findMany({
      where: { affairId: removeId },
      select: {
        id: true,
        date: true,
        type: true,
        title: true,
        description: true,
        sourceUrl: true,
        sourceTitle: true,
        identityKey: true,
      },
    });
    let eventsMoved = 0;
    for (const event of eventsToTransfer) {
      const key = eventKey(event);
      if (
        existingEventKeys.has(key) ||
        (event.identityKey !== null && existingEventIdentities.has(event.identityKey))
      ) {
        continue;
      }
      await tx.affairEvent.update({ where: { id: event.id }, data: { affairId: keepId } });
      existingEventKeys.add(key);
      if (event.identityKey) existingEventIdentities.add(event.identityKey);
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

    // --- Court decision links: the composite primary key forbids a duplicate, and
    // the cascade on the absorbed affair would delete its links along with the row.
    // A merge of affairs must never destroy a decision, nor a decision's reach.
    const keptDecisionLinks = await tx.affairCourtDecision.findMany({
      where: { affairId: keepId },
      select: { courtDecisionId: true, notes: true },
    });
    const keptByDecision = new Map(keptDecisionLinks.map((l) => [l.courtDecisionId, l.notes]));

    const decisionLinksToTransfer = await tx.affairCourtDecision.findMany({
      where: { affairId: removeId },
      select: { courtDecisionId: true, notes: true },
    });
    let decisionLinksMoved = 0;
    let decisionLinksDeduplicated = 0;
    const decisionLinksMovedIds: string[] = [];
    const decisionLinksDeduplicatedIds: string[] = [];
    for (const link of decisionLinksToTransfer) {
      if (keptByDecision.has(link.courtDecisionId)) {
        // Both affairs already cite this decision. The survivor's note wins when it
        // has one; otherwise the absorbed note is taken over. Two different texts are
        // never concatenated silently — the audit trail below records the case.
        const keptNote = keptByDecision.get(link.courtDecisionId) ?? null;
        if (!keptNote && link.notes) {
          await tx.affairCourtDecision.update({
            where: {
              affairId_courtDecisionId: {
                affairId: keepId,
                courtDecisionId: link.courtDecisionId,
              },
            },
            data: { notes: link.notes },
          });
        }
        decisionLinksDeduplicated++;
        decisionLinksDeduplicatedIds.push(link.courtDecisionId);
        continue;
      }
      // Moved rather than recreated, so `createdAt` keeps its original meaning.
      await tx.affairCourtDecision.update({
        where: {
          affairId_courtDecisionId: {
            affairId: removeId,
            courtDecisionId: link.courtDecisionId,
          },
        },
        data: { affairId: keepId },
      });
      keptByDecision.set(link.courtDecisionId, link.notes);
      decisionLinksMoved++;
      decisionLinksMovedIds.push(link.courtDecisionId);
    }

    // --- Additive field fill, plus the absorbed affair's URLs.
    const updates: Prisma.AffairUpdateInput = {};
    const identifiersMerged: string[] = [];
    for (const field of options.additiveFields ?? ADDITIVE_MERGE_FIELDS) {
      if (!keep[field] && remove[field]) {
        updates[field] = remove[field];
        identifiersMerged.push(field);
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
          // Written in the same transaction as the delete: if this insert fails,
          // the merge rolls back and the absorbed row is still there (#534).
          absorbedAffairSnapshot: buildAbsorbedSnapshot(remove),
          sourcesMoved,
          sourcesEnriched,
          eventsMoved,
          articlesMoved,
          decisionLinksMoved,
          decisionLinksDeduplicated,
          decisionLinksMovedIds,
          decisionLinksDeduplicatedIds,
          identifiersMerged,
          slugsPreserved,
          ...(options.auditNotes ? { notes: options.auditNotes } : {}),
        },
        ipAddress: options.audit?.ipAddress ?? null,
        userAgent: options.audit?.userAgent ?? null,
      },
    });

    // Same transaction as the merge: a merge without its ruling would be
    // re-proposed, a ruling without its merge would claim work never done.
    if (options.pairDecision) {
      const ruling = options.pairDecision;
      await tx.affairPairDecision.upsert(
        buildPairDecisionUpsert({
          affairIdA: keepId,
          affairIdB: ruling.otherAffairId,
          classification: "DUPLICATE",
          reviewedBy: ruling.reviewedBy,
          notes: ruling.notes,
          signal: ruling.signal,
          affairAUpdatedAt: ruling.keepUpdatedAt,
          affairBUpdatedAt: ruling.removeUpdatedAt,
          mergedIntoAffairId: keepId,
        })
      );
    }

    return {
      sourcesMoved,
      sourcesEnriched,
      eventsMoved,
      articlesMoved,
      decisionLinksMoved,
      decisionLinksDeduplicated,
      identifiersMerged,
      slugsPreserved,
    };
  }
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
