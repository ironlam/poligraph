import { MEASURE_READER_GUIDES } from "@/config/measure-reader-guides";
import { db } from "@/lib/db";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";
import { syncSearchDocument } from "@/lib/measures/search-sync";
import { invalidateMeasureTags } from "@/lib/measures/cache";
import { MeasureValidationError } from "@/lib/measures/errors";
import {
  detectReaderGuideTerms,
  normalizeReaderGuideTerm,
  READER_GUIDE_DETECTOR_VERSION,
  type ReaderGuideDetection,
} from "@/lib/measures/reader-guide-detection";
import { isOfficialInstitutionUrl } from "@/lib/measures/reader-guide-source";

type GuideMatch = {
  id: string;
  slug: string;
  label: string;
  aliases: string[];
  publicationStatus: string;
};

export type ReaderGuideProposal = ReaderGuideDetection & {
  normalizedTerm: string;
  guideId: string | null;
  guideSlug: string | null;
  guideLabel: string | null;
};

function findGuide(term: string, canonicalLabel: string, guides: GuideMatch[]): GuideMatch | null {
  const candidates = new Set([
    normalizeReaderGuideTerm(term),
    normalizeReaderGuideTerm(canonicalLabel),
  ]);
  return (
    guides.find((guide) =>
      [guide.label, ...guide.aliases].some((alias) =>
        candidates.has(normalizeReaderGuideTerm(alias))
      )
    ) ?? null
  );
}

export async function syncReaderGuideCatalog(actor = "system"): Promise<{
  created: number;
  updated: number;
  preserved: number;
}> {
  let created = 0;
  let updated = 0;
  let preserved = 0;
  for (const definition of MEASURE_READER_GUIDES) {
    const outcome = await db.$transaction(async (tx) => {
      const existing = await tx.measureReaderGuide.findUnique({
        where: { slug: definition.slug },
        select: { id: true, publicationStatus: true },
      });
      if (!existing) {
        const guide = await tx.measureReaderGuide.create({
          data: {
            ...definition,
            aliases: [...definition.aliases],
            sourceKind: "OFFICIAL_INSTITUTION",
            publicationStatus: "DRAFT",
          },
        });
        await tx.auditLog.create({
          data: {
            action: "CREATE_READER_GUIDE_DRAFT",
            entityType: "MeasureReaderGuide",
            entityId: guide.id,
            changes: { slug: definition.slug, catalog: true },
            userId: actor,
          },
        });
        return "created" as const;
      }
      if (existing.publicationStatus !== "DRAFT") return "preserved" as const;
      await tx.measureReaderGuide.update({
        where: { id: existing.id },
        data: {
          label: definition.label,
          definition: definition.definition,
          aliases: [...definition.aliases],
          sourceUrl: definition.sourceUrl,
          sourceLabel: definition.sourceLabel,
          sourcePublisher: definition.sourcePublisher,
          sourceKind: "OFFICIAL_INSTITUTION",
        },
      });
      await tx.auditLog.create({
        data: {
          action: "SYNC_READER_GUIDE_DRAFT",
          entityType: "MeasureReaderGuide",
          entityId: existing.id,
          changes: { slug: definition.slug, catalog: true },
          userId: actor,
        },
      });
      return "updated" as const;
    });
    if (outcome === "created") created += 1;
    if (outcome === "updated") updated += 1;
    if (outcome === "preserved") preserved += 1;
  }
  return { created, updated, preserved };
}

export async function detectReaderGuidesForRevision(revisionId: string): Promise<{
  revisionId: string;
  measureId: string;
  electionId: string;
  proposals: ReaderGuideProposal[];
}> {
  const [revision, guides] = await Promise.all([
    db.measureRevision.findUnique({
      where: { id: revisionId },
      select: {
        text: true,
        details: true,
        measure: { select: { id: true, electionId: true } },
      },
    }),
    db.measureReaderGuide.findMany({
      where: { active: true, publicationStatus: { in: ["DRAFT", "PUBLISHED"] } },
      select: { id: true, slug: true, label: true, aliases: true, publicationStatus: true },
      orderBy: { label: "asc" },
    }),
  ]);
  if (!revision) throw new MeasureValidationError("Révision introuvable");
  const detections = await detectReaderGuideTerms({
    text: revision.text,
    details: revision.details,
    knownLabels: guides.flatMap((guide) => [guide.label, ...guide.aliases]),
  });
  return {
    revisionId,
    measureId: revision.measure.id,
    electionId: revision.measure.electionId,
    proposals: detections.map((detection) => {
      const guide = findGuide(detection.term, detection.canonicalLabel, guides);
      return {
        ...detection,
        normalizedTerm: normalizeReaderGuideTerm(detection.term),
        guideId: guide?.id ?? null,
        guideSlug: guide?.slug ?? null,
        guideLabel: guide?.label ?? null,
      };
    }),
  };
}

export async function proposeReaderGuidesForRevision(
  revisionId: string,
  actor = "system"
): Promise<{ created: number; proposals: ReaderGuideProposal[] }> {
  const detection = await detectReaderGuidesForRevision(revisionId);
  const created = await db.$transaction(async (tx) => {
    let count = 0;
    for (const proposal of detection.proposals) {
      const result = await tx.measureRevisionReaderGuide.createMany({
        data: [
          {
            revisionId,
            guideId: proposal.guideId,
            term: proposal.term,
            normalizedTerm: proposal.normalizedTerm,
            evidenceSpan: proposal.evidenceSpan,
            reason: proposal.reason,
            confidence: proposal.confidence,
            status: "SUGGESTED",
            method: "AI_ASSISTED",
            detectorVersion: READER_GUIDE_DETECTOR_VERSION,
          },
        ],
        skipDuplicates: true,
      });
      count += result.count;
    }
    await tx.auditLog.create({
      data: {
        action: "PROPOSE_READER_GUIDES",
        entityType: "MeasureRevision",
        entityId: revisionId,
        changes: {
          detectorVersion: READER_GUIDE_DETECTOR_VERSION,
          created: count,
          proposals: detection.proposals.map((proposal) => ({
            term: proposal.term,
            normalizedTerm: proposal.normalizedTerm,
            guideSlug: proposal.guideSlug,
            reason: proposal.reason,
            confidence: proposal.confidence,
          })),
        },
        userId: actor,
      },
    });
    return count;
  });
  return { created, proposals: detection.proposals };
}

export async function reviewReaderGuideMention(input: {
  mentionId: string;
  guideId?: string;
  status: "APPROVED" | "REJECTED";
  reviewedBy: string;
}): Promise<void> {
  const measure = await db.$transaction(async (tx) => {
    const mention = await tx.measureRevisionReaderGuide.findUnique({
      where: { id: input.mentionId },
      select: {
        status: true,
        guideId: true,
        revisionId: true,
        revision: { select: { measure: { select: { id: true, electionId: true } } } },
      },
    });
    if (!mention || mention.status !== "SUGGESTED") {
      throw new MeasureValidationError("Cette proposition a déjà été traitée");
    }
    const guideId = input.guideId ?? mention.guideId;
    if (input.status === "APPROVED") {
      if (!guideId) throw new MeasureValidationError("Choisissez un repère avant de valider");
      const guide = await tx.measureReaderGuide.findUnique({
        where: { id: guideId },
        select: { publicationStatus: true, active: true },
      });
      if (!guide || !guide.active || guide.publicationStatus !== "PUBLISHED") {
        throw new MeasureValidationError("Le repère doit être publié avant son rattachement");
      }
      const duplicate = await tx.measureRevisionReaderGuide.findFirst({
        where: {
          id: { not: input.mentionId },
          revisionId: mention.revisionId,
          guideId,
          status: "APPROVED",
        },
        select: { id: true },
      });
      if (duplicate) throw new MeasureValidationError("Ce repère est déjà validé pour la révision");
    }
    const updated = await tx.measureRevisionReaderGuide.updateMany({
      where: { id: input.mentionId, status: "SUGGESTED" },
      data: {
        guideId: guideId ?? null,
        status: input.status,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
      },
    });
    if (updated.count !== 1)
      throw new MeasureValidationError("Cette proposition a déjà été traitée");
    await tx.auditLog.create({
      data: {
        action: "REVIEW_READER_GUIDE_MENTION",
        entityType: "MeasureRevisionReaderGuide",
        entityId: input.mentionId,
        changes: { status: input.status, guideId: guideId ?? null },
        userId: input.reviewedBy,
      },
    });
    await syncSearchDocument(tx, mention.revision.measure.id);
    return mention.revision.measure;
  });
  invalidateMeasureTags(measure.id, measure.electionId);
}

export type ReaderGuideDraftInput = {
  id?: string;
  slug: string;
  label: string;
  definition: string;
  aliases: string[];
  sourceKind: "OFFICIAL_INSTITUTION" | "PROGRAM_SOURCE";
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
  sourceRevisionId?: string | null;
};

async function validateReaderGuideDraft(input: ReaderGuideDraftInput): Promise<void> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    throw new MeasureValidationError("Le slug doit contenir uniquement des minuscules et tirets");
  }
  if (input.label.trim().length < 3 || input.definition.trim().length < 40) {
    throw new MeasureValidationError("Le libellé ou la définition est trop court");
  }
  if (input.sourceKind === "OFFICIAL_INSTITUTION") {
    if (!isOfficialInstitutionUrl(input.sourceUrl)) {
      throw new MeasureValidationError("La source doit être une page institutionnelle officielle");
    }
    return;
  }
  if (!input.sourceRevisionId) {
    throw new MeasureValidationError("Une source de programme doit être rattachée à une révision");
  }
  const source = await db.measureSource.findFirst({
    where: { measureRevisionId: input.sourceRevisionId, url: input.sourceUrl },
    select: { id: true },
  });
  if (!source)
    throw new MeasureValidationError("Cette URL ne fait pas partie des sources de la révision");
}

export async function saveReaderGuideDraft(
  input: ReaderGuideDraftInput,
  actor: string
): Promise<string> {
  await validateReaderGuideDraft(input);
  const data = {
    slug: input.slug.trim(),
    label: input.label.trim(),
    definition: input.definition.trim(),
    aliases: [...new Set(input.aliases.map((alias) => alias.trim()).filter(Boolean))],
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl.trim(),
    sourceLabel: input.sourceLabel.trim(),
    sourcePublisher: input.sourcePublisher.trim(),
    sourceRevisionId: input.sourceRevisionId ?? null,
  };
  return db.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.measureReaderGuide.findUnique({
        where: { id: input.id },
        select: { publicationStatus: true },
      });
      if (!existing || existing.publicationStatus !== "DRAFT") {
        throw new MeasureValidationError("Seul un brouillon peut être modifié");
      }
      await tx.measureReaderGuide.update({ where: { id: input.id }, data });
      await tx.auditLog.create({
        data: {
          action: "UPDATE_READER_GUIDE_DRAFT",
          entityType: "MeasureReaderGuide",
          entityId: input.id,
          changes: data,
          userId: actor,
        },
      });
      return input.id;
    }
    const created = await tx.measureReaderGuide.create({
      data: { ...data, publicationStatus: "DRAFT" },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        action: "CREATE_READER_GUIDE_DRAFT",
        entityType: "MeasureReaderGuide",
        entityId: created.id,
        changes: data,
        userId: actor,
      },
    });
    return created.id;
  });
}

export async function publishReaderGuide(guideId: string, actor: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const guide = await tx.measureReaderGuide.findUnique({ where: { id: guideId } });
    if (!guide || guide.publicationStatus !== "DRAFT") {
      throw new MeasureValidationError("Ce repère n'est pas un brouillon publiable");
    }
    if (!guide.sourceLabel.trim() || !guide.sourcePublisher.trim() || !guide.definition.trim()) {
      throw new MeasureValidationError("Le repère ou sa source est incomplet");
    }
    if (guide.sourceKind === "OFFICIAL_INSTITUTION" && !isOfficialInstitutionUrl(guide.sourceUrl)) {
      throw new MeasureValidationError("La source institutionnelle n'est pas valide");
    }
    if (guide.sourceKind === "PROGRAM_SOURCE") {
      if (!guide.sourceRevisionId) {
        throw new MeasureValidationError("La source de programme n'est pas rattachée");
      }
      const source = await tx.measureSource.findFirst({
        where: { measureRevisionId: guide.sourceRevisionId, url: guide.sourceUrl },
        select: { id: true },
      });
      if (!source) throw new MeasureValidationError("La source de programme n'est plus valide");
    }
    await tx.measureReaderGuide.update({
      where: { id: guideId },
      data: { publicationStatus: "PUBLISHED", reviewedAt: new Date(), reviewedBy: actor },
    });
    await tx.auditLog.create({
      data: {
        action: "PUBLISH_READER_GUIDE",
        entityType: "MeasureReaderGuide",
        entityId: guideId,
        changes: { publicationStatus: "PUBLISHED" },
        userId: actor,
      },
    });
  });
}

export async function listReaderGuideDetectionCandidates(input: {
  electionSlug: string;
  limit: number;
  after?: string;
}) {
  return db.measure.findMany({
    where: {
      AND: [
        PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
        {
          publishedRevision: {
            is: {
              readerGuideMentions: {
                none: { detectorVersion: READER_GUIDE_DETECTOR_VERSION },
              },
            },
          },
        },
      ],
      election: { slug: input.electionSlug },
      ...(input.after ? { id: { gt: input.after } } : {}),
    },
    orderBy: { id: "asc" },
    take: input.limit,
    select: {
      id: true,
      theme: true,
      publishedRevisionId: true,
      candidacy: { select: { candidateName: true } },
    },
  });
}
