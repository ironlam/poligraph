import { createHash } from "node:crypto";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";
import { db } from "@/lib/db";
import { normalizeReaderGuideTerm } from "@/lib/measures/reader-guide-detection";
import { isOfficialInstitutionUrl } from "@/lib/measures/reader-guide-source";
import { publishReaderGuide, reviewReaderGuideMention } from "@/lib/measures/reader-guides";

const PROGRAM_SOURCE_KINDS = new Set([
  "PROGRAMME_PARTI",
  "PROGRAMME_CANDIDAT",
  "PROPOSITIONS_CANDIDAT",
]);

type FinalizationGuide = {
  id: string;
  slug: string;
  label: string;
  aliases: string[];
  definition: string;
  publicationStatus: string;
  sourceKind: "OFFICIAL_INSTITUTION" | "PROGRAM_SOURCE";
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
  sourceRevisionId: string | null;
  sourceRevision: {
    sources: Array<{ url: string; tier: string; sourceKind: string }>;
  } | null;
};

type FinalizationMention = {
  id: string;
  guideId: string | null;
  term: string;
  normalizedTerm: string;
  evidenceSpan: string;
  reason: string;
  confidence: number;
  revision: {
    id: string;
    text: string;
    readerGuideMentions: Array<{ guideId: string | null }>;
    publishedOf: { id: string; electionId: string } | null;
  };
};

export type ReaderGuideFinalizationItem = {
  mentionId: string;
  revisionId: string;
  measureId: string;
  term: string;
  measureText: string;
  evidenceSpan: string;
  detectionReason: string;
  confidence: number;
  guideId: string | null;
  guideSlug: string | null;
  guideLabel: string | null;
  outcome: "READY" | "UNRESOLVED" | "INVALID_GUIDE" | "DUPLICATE";
  reason: string;
  publishesGuide: boolean;
};

export type ReaderGuideFinalizationGuideSnapshot = {
  id: string;
  slug: string;
  label: string;
  definition: string;
  aliases: string[];
  sourceKind: "OFFICIAL_INSTITUTION" | "PROGRAM_SOURCE";
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
  sourceRevisionId: string | null;
};

export type ReaderGuideFinalizationPlan = {
  electionSlug: string;
  scanned: number;
  ready: number;
  unresolved: number;
  invalidGuides: number;
  duplicates: number;
  guideSnapshots: ReaderGuideFinalizationGuideSnapshot[];
  guidesToPublish: ReaderGuideFinalizationGuideSnapshot[];
  unresolvedTerms: Array<{ normalizedTerm: string; example: string; occurrences: number }>;
  nextAfter: string | null;
  items: ReaderGuideFinalizationItem[];
};

export function hashReaderGuideFinalizationPlan(plan: ReaderGuideFinalizationPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

function snapshotGuide(guide: FinalizationGuide): ReaderGuideFinalizationGuideSnapshot {
  return {
    id: guide.id,
    slug: guide.slug,
    label: guide.label,
    definition: guide.definition,
    aliases: guide.aliases,
    sourceKind: guide.sourceKind,
    sourceUrl: guide.sourceUrl,
    sourceLabel: guide.sourceLabel,
    sourcePublisher: guide.sourcePublisher,
    sourceRevisionId: guide.sourceRevisionId,
  };
}

export function isReaderGuideFinalizationRetryCompatible(
  reviewed: ReaderGuideFinalizationPlan,
  current: ReaderGuideFinalizationPlan,
  finalizedMentionIds: ReadonlySet<string> = new Set()
): boolean {
  if (reviewed.electionSlug !== current.electionSlug) return false;
  const reviewedItems = new Map(reviewed.items.map((item) => [item.mentionId, item]));
  const currentMentionIds = new Set(current.items.map((item) => item.mentionId));
  const reviewedGuides = new Map(reviewed.guideSnapshots.map((guide) => [guide.id, guide]));
  const stableItem = ({
    reason: _reason,
    publishesGuide: _publishesGuide,
    ...item
  }: ReaderGuideFinalizationItem) => item;
  return (
    reviewed.items.every(
      (item) => currentMentionIds.has(item.mentionId) || finalizedMentionIds.has(item.mentionId)
    ) &&
    current.items.every((item) => {
      const reviewedItem = reviewedItems.get(item.mentionId);
      return (
        reviewedItem !== undefined &&
        JSON.stringify(stableItem(reviewedItem)) === JSON.stringify(stableItem(item))
      );
    }) &&
    current.guideSnapshots.every((guide) => {
      const reviewedGuide = reviewedGuides.get(guide.id);
      return reviewedGuide !== undefined && JSON.stringify(reviewedGuide) === JSON.stringify(guide);
    })
  );
}

export async function getFinalizedReaderGuideMentionIds(
  mentionIds: string[]
): Promise<Set<string>> {
  const finalized = new Set<string>();
  for (let index = 0; index < mentionIds.length; index += 500) {
    const rows = await db.measureRevisionReaderGuide.findMany({
      where: {
        id: { in: mentionIds.slice(index, index + 500) },
        status: { in: ["APPROVED", "REJECTED"] },
      },
      select: { id: true },
    });
    for (const row of rows) finalized.add(row.id);
  }
  return finalized;
}

function guidePublicationBlocker(guide: FinalizationGuide): string | null {
  if (guide.publicationStatus === "PUBLISHED") return null;
  if (!guide.definition.trim() || !guide.sourceLabel.trim() || !guide.sourcePublisher.trim()) {
    return "Le brouillon ou sa source est incomplet";
  }
  if (guide.sourceKind === "OFFICIAL_INSTITUTION") {
    return isOfficialInstitutionUrl(guide.sourceUrl)
      ? null
      : "La source institutionnelle n'est pas autorisée";
  }
  if (!guide.sourceRevisionId || !guide.sourceRevision) {
    return "La source de programme n'est pas rattachée à une révision";
  }
  const sourceExists = guide.sourceRevision.sources.some(
    (source) =>
      source.url === guide.sourceUrl &&
      source.tier === "PRIMARY" &&
      PROGRAM_SOURCE_KINDS.has(source.sourceKind)
  );
  return sourceExists ? null : "La source de programme primaire n'est plus valide";
}

function buildGuideIndexes(guides: FinalizationGuide[]) {
  const byId = new Map(guides.map((guide) => [guide.id, guide]));
  const byTerm = new Map<string, FinalizationGuide>();
  for (const guide of guides) {
    for (const term of [guide.label, ...guide.aliases]) {
      const normalized = normalizeReaderGuideTerm(term);
      if (!byTerm.has(normalized)) byTerm.set(normalized, guide);
    }
  }
  return { byId, byTerm };
}

export function planReaderGuideFinalization(input: {
  electionSlug: string;
  guides: FinalizationGuide[];
  mentions: FinalizationMention[];
}): ReaderGuideFinalizationPlan {
  const { byId, byTerm } = buildGuideIndexes(input.guides);
  const seenRevisionGuides = new Set<string>();
  const items: ReaderGuideFinalizationItem[] = [];

  for (const mention of input.mentions) {
    for (const approved of mention.revision.readerGuideMentions) {
      if (approved.guideId) {
        seenRevisionGuides.add(`${mention.revision.id}:${approved.guideId}`);
      }
    }
  }

  for (const mention of input.mentions) {
    const measure = mention.revision.publishedOf;
    if (!measure) continue;
    const guide =
      (mention.guideId ? byId.get(mention.guideId) : undefined) ??
      byTerm.get(mention.normalizedTerm) ??
      byTerm.get(normalizeReaderGuideTerm(mention.term));
    const base = {
      mentionId: mention.id,
      revisionId: mention.revision.id,
      measureId: measure.id,
      term: mention.term,
      measureText: mention.revision.text,
      evidenceSpan: mention.evidenceSpan,
      detectionReason: mention.reason,
      confidence: mention.confidence,
      guideId: guide?.id ?? null,
      guideSlug: guide?.slug ?? null,
      guideLabel: guide?.label ?? null,
      publishesGuide: guide?.publicationStatus === "DRAFT",
    };
    if (!guide) {
      items.push({
        ...base,
        outcome: "UNRESOLVED",
        reason: "Aucun repère actif ne correspond au terme, au libellé ou à un alias",
      });
      continue;
    }
    const blocker = guidePublicationBlocker(guide);
    if (blocker) {
      items.push({ ...base, outcome: "INVALID_GUIDE", reason: blocker });
      continue;
    }
    const duplicateKey = `${mention.revision.id}:${guide.id}`;
    if (seenRevisionGuides.has(duplicateKey)) {
      items.push({
        ...base,
        publishesGuide: false,
        outcome: "DUPLICATE",
        reason: "Ce repère est déjà validé ou retenu pour cette révision",
      });
      continue;
    }
    seenRevisionGuides.add(duplicateKey);
    items.push({
      ...base,
      outcome: "READY",
      reason:
        guide.publicationStatus === "DRAFT"
          ? "Le repère sourcé sera publié puis le rattachement approuvé"
          : "Le rattachement au repère publié sera approuvé",
    });
  }

  const guideSnapshots = [
    ...new Map(
      items
        .filter((item) => item.outcome === "READY" && item.guideId)
        .map((item) => {
          const guide = byId.get(item.guideId!)!;
          return [guide.id, snapshotGuide(guide)] as const;
        })
    ).values(),
  ];
  const guidesToPublish = guideSnapshots.filter((guide) =>
    items.some(
      (item) => item.outcome === "READY" && item.publishesGuide && item.guideId === guide.id
    )
  );
  const unresolvedTerms = [
    ...items
      .filter((item) => item.outcome === "UNRESOLVED")
      .reduce((terms, item) => {
        const normalizedTerm = normalizeReaderGuideTerm(item.term);
        const existing = terms.get(normalizedTerm);
        terms.set(normalizedTerm, {
          normalizedTerm,
          example: existing?.example ?? item.term,
          occurrences: (existing?.occurrences ?? 0) + 1,
        });
        return terms;
      }, new Map<string, { normalizedTerm: string; example: string; occurrences: number }>())
      .values(),
  ].sort((left, right) =>
    right.occurrences === left.occurrences
      ? left.example.localeCompare(right.example, "fr")
      : right.occurrences - left.occurrences
  );
  return {
    electionSlug: input.electionSlug,
    scanned: input.mentions.length,
    ready: items.filter((item) => item.outcome === "READY").length,
    unresolved: items.filter((item) => item.outcome === "UNRESOLVED").length,
    invalidGuides: items.filter((item) => item.outcome === "INVALID_GUIDE").length,
    duplicates: items.filter((item) => item.outcome === "DUPLICATE").length,
    guideSnapshots,
    guidesToPublish,
    unresolvedTerms,
    nextAfter: input.mentions.at(-1)?.id ?? null,
    items,
  };
}

async function listMentions(input: {
  electionSlug: string;
  limit?: number;
  after?: string;
  mentionIds?: string[];
}): Promise<FinalizationMention[]> {
  const mentions: FinalizationMention[] = [];
  let cursor = input.after;
  let remaining = input.mentionIds?.length ?? input.limit ?? Number.POSITIVE_INFINITY;
  while (remaining > 0) {
    const take = Math.min(500, remaining);
    const id = input.mentionIds
      ? { in: input.mentionIds, ...(cursor ? { gt: cursor } : {}) }
      : cursor
        ? { gt: cursor }
        : undefined;
    const rows = await db.measureRevisionReaderGuide.findMany({
      where: {
        status: "SUGGESTED",
        ...(id ? { id } : {}),
        revision: {
          publishedOf: {
            is: {
              ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
              election: { slug: input.electionSlug },
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take,
      select: {
        id: true,
        guideId: true,
        term: true,
        normalizedTerm: true,
        evidenceSpan: true,
        reason: true,
        confidence: true,
        revision: {
          select: {
            id: true,
            text: true,
            readerGuideMentions: {
              where: { status: "APPROVED" },
              select: { guideId: true },
            },
            publishedOf: { select: { id: true, electionId: true } },
          },
        },
      },
    });
    mentions.push(...rows);
    remaining -= rows.length;
    if (rows.length < take) break;
    cursor = rows.at(-1)!.id;
  }
  return mentions;
}

export async function prepareReaderGuideFinalization(input: {
  electionSlug: string;
  limit?: number;
  after?: string;
  mentionIds?: string[];
}): Promise<ReaderGuideFinalizationPlan> {
  const [guides, mentions] = await Promise.all([
    db.measureReaderGuide.findMany({
      where: { active: true, publicationStatus: { in: ["DRAFT", "PUBLISHED"] } },
      select: {
        id: true,
        slug: true,
        label: true,
        aliases: true,
        definition: true,
        publicationStatus: true,
        sourceKind: true,
        sourceUrl: true,
        sourceLabel: true,
        sourcePublisher: true,
        sourceRevisionId: true,
        sourceRevision: {
          select: {
            sources: { select: { url: true, tier: true, sourceKind: true } },
          },
        },
      },
      orderBy: { label: "asc" },
    }),
    listMentions(input),
  ]);
  return planReaderGuideFinalization({ electionSlug: input.electionSlug, guides, mentions });
}

export async function applyReaderGuideFinalization(
  plan: ReaderGuideFinalizationPlan,
  actor: string
): Promise<{ publishedGuides: number; approvedMentions: number; errors: string[] }> {
  const errors: string[] = [];
  let publishedGuides = 0;
  let approvedMentions = 0;
  const failedGuideIds = new Set<string>();

  for (const guide of plan.guidesToPublish) {
    try {
      await publishReaderGuide(guide.id, actor, {}, guide);
      publishedGuides += 1;
    } catch (error) {
      failedGuideIds.add(guide.id);
      errors.push(`${guide.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const ready = plan.items.filter(
    (item) => item.outcome === "READY" && item.guideId !== null && !failedGuideIds.has(item.guideId)
  );
  const byMeasure = [
    ...ready
      .reduce((groups, item) => {
        const group = groups.get(item.measureId) ?? [];
        group.push(item);
        groups.set(item.measureId, group);
        return groups;
      }, new Map<string, ReaderGuideFinalizationItem[]>())
      .values(),
  ];
  for (let index = 0; index < byMeasure.length; index += 5) {
    const groups = byMeasure.slice(index, index + 5);
    const outcomes = await Promise.all(
      groups.map(async (items) => {
        const groupErrors: string[] = [];
        let groupApproved = 0;
        for (const item of items) {
          try {
            await reviewReaderGuideMention({
              mentionId: item.mentionId,
              guideId: item.guideId!,
              expectedPublicRevisionId: item.revisionId,
              status: "APPROVED",
              reviewedBy: actor,
            });
            groupApproved += 1;
          } catch (error) {
            groupErrors.push(
              `${item.mentionId}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
        return { groupApproved, groupErrors };
      })
    );
    for (const outcome of outcomes) {
      approvedMentions += outcome.groupApproved;
      errors.push(...outcome.groupErrors);
    }
  }
  return { publishedGuides, approvedMentions, errors };
}
