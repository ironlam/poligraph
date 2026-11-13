import { db } from "@/lib/db";
import {
  moderateAffair,
  getAIRateLimitMs,
  type ModerationInput,
  type ModerationResult,
} from "@/services/affair-moderation";
import {
  findPotentialDuplicates,
  type PotentialDuplicate,
} from "@/services/affairs/reconciliation";
import { sleep } from "@/lib/utils";
import { auditAttribution } from "./attribution";
import type {
  ModerationPreflightReport,
  DraftCandidate,
  DuplicateGroup,
  ModerationRecommendation,
} from "@/types/moderation-preflight";

interface RunPreflightOptions {
  source: "cron" | "manual";
  limit?: number;
  /**
   * Moderation results computed elsewhere, keyed by affair id. The batch path
   * supplies these so the report is assembled without any synchronous AI call.
   * A draft missing from the map still falls back to NEEDS_REVIEW below, so the
   * safe default is identical on both transports.
   */
  moderationResults?: Map<string, ModerationResult>;
  /**
   * Build the report without any AI opinion: every draft is NEEDS_REVIEW, and the
   * duplicate and attribution checks still run. For a provider known to be down
   * (no credit), where calling it would only log one failure per draft.
   */
  skipModeration?: boolean;
}

/** What a draft gets when no AI opinion is available: the safe default, never PUBLISH. */
function unmoderated(reasoning: string): ModerationResult {
  return {
    recommendation: "NEEDS_REVIEW",
    issues: [],
    confidence: 0,
    reasoning,
    correctedTitle: null,
    correctedDescription: null,
    correctedStatus: null,
    correctedCategory: null,
    correctedInvolvement: null,
    model: "fallback",
  };
}

/**
 * Build the moderation inputs for the current DRAFT backlog, without calling
 * the API. Lets the batch path queue every request up front.
 */
export async function buildModerationInputs(limit?: number): Promise<ModerationInput[]> {
  const drafts = await db.affair.findMany({
    where: { publicationStatus: "DRAFT" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      politician: { select: { id: true, slug: true, fullName: true } },
      sources: true,
    },
  });

  const politicianIds = [
    ...new Set(drafts.map((d) => d.politicianId).filter((id): id is string => Boolean(id))),
  ];
  const published = politicianIds.length
    ? await db.affair.findMany({
        where: { politicianId: { in: politicianIds }, publicationStatus: "PUBLISHED" },
        select: { politicianId: true, title: true },
      })
    : [];
  const titlesByPolitician = new Map<string, string[]>();
  for (const affair of published) {
    const list = titlesByPolitician.get(affair.politicianId) ?? [];
    list.push(affair.title);
    titlesByPolitician.set(affair.politicianId, list);
  }

  return drafts
    .filter((d) => d.politician)
    .map((draft) => ({
      affairId: draft.id,
      title: draft.title,
      description: draft.description ?? "",
      status: draft.status,
      category: draft.category ?? "AUTRE",
      involvement: draft.involvement ?? "MENTIONED_ONLY",
      politicianName: draft.politician!.fullName,
      politicianSlug: draft.politician!.slug,
      sources: draft.sources.map((s) => ({
        url: s.url,
        title: s.title ?? "",
        publisher: s.publisher ?? "",
        publishedAt: s.publishedAt?.toISOString() ?? "",
      })),
      factsDate: draft.factsDate?.toISOString() ?? null,
      startDate: draft.startDate?.toISOString() ?? null,
      verdictDate: draft.verdictDate?.toISOString() ?? null,
      court: draft.court ?? null,
      sentence: draft.sentence ?? null,
      existingAffairTitles: titlesByPolitician.get(draft.politicianId) ?? [],
    }));
}

export async function runPreflight(
  options: RunPreflightOptions
): Promise<ModerationPreflightReport> {
  const drafts = await db.affair.findMany({
    where: { publicationStatus: "DRAFT" },
    orderBy: { createdAt: "asc" },
    take: options.limit,
    include: {
      politician: {
        select: { id: true, slug: true, fullName: true, normalizedLastName: true },
      },
      sources: true,
      events: { orderBy: { date: "asc" } },
    },
  });

  const allPoliticians = await db.politician.findMany({
    select: { id: true, fullName: true, normalizedLastName: true },
  });

  const politicianRoster = allPoliticians.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    normalizedLastName: p.normalizedLastName ?? p.fullName,
  }));

  // Published affairs of the drafted politicians, for duplicate detection
  // against the existing catalogue (a draft often duplicates an affair
  // already published from an earlier sync wave).
  const draftPoliticianIds = [
    ...new Set(drafts.map((d) => d.politicianId).filter((id): id is string => Boolean(id))),
  ];
  const publishedAffairs = draftPoliticianIds.length
    ? await db.affair.findMany({
        where: {
          politicianId: { in: draftPoliticianIds },
          publicationStatus: "PUBLISHED",
        },
        select: { politicianId: true, title: true },
      })
    : [];
  const publishedTitlesByPolitician = new Map<string, string[]>();
  for (const affair of publishedAffairs) {
    const list = publishedTitlesByPolitician.get(affair.politicianId) ?? [];
    list.push(affair.title);
    publishedTitlesByPolitician.set(affair.politicianId, list);
  }

  const duplicates = await findPotentialDuplicates();
  const duplicateGroups = buildDuplicateGroups(duplicates);
  const duplicatesByAffair = buildDuplicateIndex(duplicates);

  const draftCandidates: DraftCandidate[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    if (!draft.politician) continue;

    let moderation: ModerationResult;
    const precomputed = options.moderationResults?.get(draft.id);
    try {
      if (options.skipModeration) {
        moderation = unmoderated("Modération IA désactivée ; relecture manuelle requise.");
      } else if (options.moderationResults) {
        if (!precomputed) throw new Error("absent des résultats de modération fournis");
        moderation = precomputed;
      } else {
        moderation = await moderateAffair({
          affairId: draft.id,
          title: draft.title,
          description: draft.description ?? "",
          status: draft.status,
          category: draft.category ?? "AUTRE",
          involvement: draft.involvement ?? "MENTIONED_ONLY",
          politicianName: draft.politician.fullName,
          politicianSlug: draft.politician.slug,
          sources: draft.sources.map((s) => ({
            url: s.url,
            title: s.title ?? "",
            publisher: s.publisher ?? "",
            publishedAt: s.publishedAt?.toISOString() ?? "",
          })),
          factsDate: draft.factsDate?.toISOString() ?? null,
          startDate: draft.startDate?.toISOString() ?? null,
          verdictDate: draft.verdictDate?.toISOString() ?? null,
          court: draft.court ?? null,
          sentence: draft.sentence ?? null,
          existingAffairTitles: publishedTitlesByPolitician.get(draft.politicianId) ?? [],
        });
      }
    } catch (err) {
      console.error(`[preflight] moderateAffair failed for draft ${draft.id}:`, err);
      moderation = unmoderated("Moderation failed; manual review required.");
    }

    const attribution = auditAttribution({
      affairTitle: draft.title,
      affairDescription: draft.description ?? "",
      politician: {
        id: draft.politician.id,
        fullName: draft.politician.fullName,
        normalizedLastName: draft.politician.normalizedLastName ?? draft.politician.fullName,
      },
      otherPoliticians: politicianRoster.filter((p) => p.id !== draft.politician!.id),
    });

    draftCandidates.push({
      id: draft.id,
      title: draft.title,
      publicationStatus: "DRAFT",
      createdAt: draft.createdAt.toISOString(),
      politician: {
        id: draft.politician.id,
        slug: draft.politician.slug,
        fullName: draft.politician.fullName,
      },
      category: draft.category ?? "AUTRE",
      status: draft.status,
      preflight: {
        moderationRecommendation: mapModerationRec(moderation),
        moderationIssues: moderation.issues,
        correctedInvolvement: moderation.correctedInvolvement,
        attribution,
        duplicateOf: duplicatesByAffair.get(draft.id) ?? [],
      },
    });

    // Pas de temporisation quand les résultats sont déjà là : le débit de
    // l'API n'est plus en jeu.
    if (!options.moderationResults && !options.skipModeration && i < drafts.length - 1) {
      await sleep(getAIRateLimitMs());
    }
  }

  const stats = {
    totalDrafts: draftCandidates.length,
    duplicateGroups: duplicateGroups.length,
    attributionIssues: draftCandidates.filter(
      (d) => d.preflight.attribution.confidence !== "STRONG"
    ).length,
    autoPublishCandidates: draftCandidates.filter(
      (d) =>
        d.preflight.moderationRecommendation === "PUBLISH" &&
        d.preflight.attribution.confidence === "STRONG" &&
        d.preflight.duplicateOf.length === 0 &&
        d.preflight.moderationIssues.length === 0
    ).length,
    needsReview: draftCandidates.filter(
      (d) => d.preflight.moderationRecommendation === "NEEDS_REVIEW"
    ).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    ttlHours: 24,
    source: options.source,
    stats,
    drafts: draftCandidates,
    duplicateGroups,
  };
}

function mapModerationRec(result: ModerationResult): ModerationRecommendation {
  if (result.recommendation === "PUBLISH") return "PUBLISH";
  if (result.recommendation === "REJECT") return "REJECT";
  return "NEEDS_REVIEW";
}

function buildDuplicateIndex(pairs: PotentialDuplicate[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const pair of pairs) {
    const aList = index.get(pair.affairA.id) ?? [];
    aList.push(pair.affairB.id);
    index.set(pair.affairA.id, aList);

    const bList = index.get(pair.affairB.id) ?? [];
    bList.push(pair.affairA.id);
    index.set(pair.affairB.id, bList);
  }
  return index;
}

function buildDuplicateGroups(pairs: PotentialDuplicate[]): DuplicateGroup[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let p = parent.get(id) ?? id;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(id, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const pair of pairs) {
    union(pair.affairA.id, pair.affairB.id);
  }

  const groups = new Map<string, { ids: string[]; score: number; matchedBy: string }>();
  for (const pair of pairs) {
    const root = find(pair.affairA.id);
    const entry = groups.get(root) ?? { ids: [], score: 0, matchedBy: pair.matchedBy };
    if (!entry.ids.includes(pair.affairA.id)) entry.ids.push(pair.affairA.id);
    if (!entry.ids.includes(pair.affairB.id)) entry.ids.push(pair.affairB.id);
    entry.score = Math.max(entry.score, pair.score);
    groups.set(root, entry);
  }

  const result: DuplicateGroup[] = [];
  for (const entry of groups.values()) {
    const sortedIds = [...entry.ids].sort();
    const recommendedKeep = sortedIds[0];
    if (!recommendedKeep) continue;
    result.push({
      affairIds: sortedIds,
      score: entry.score,
      matchedBy: entry.matchedBy,
      recommendedKeep,
      autoMergeEligible: entry.score >= 0.95,
    });
  }
  return result;
}
