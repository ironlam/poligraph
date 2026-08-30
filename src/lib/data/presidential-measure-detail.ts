import "server-only";

import { cache } from "react";
import type {
  Chamber,
  MeasureAttribution,
  MeasurePrecision,
  MeasureSourceKind,
  SourceTier,
  ThemeCategory,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  PUBLIC_MEASURE_REVISION_WHERE,
  PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
} from "@/lib/presidentielle/publication";
import { deriveVoteRelation, type VoteRelation } from "@/lib/measures/vote-relation";
import { readEvidenceSnapshot } from "@/lib/measures/evidence-snapshot";
import {
  GENERATED_CONTEXT_DRAFT_ACTION,
  readGeneratedContextClaims,
} from "@/lib/measures/context-provenance";

export type PublicPresidentialMeasureDetail = {
  id: string;
  slug: string;
  electionSlug: string;
  theme: ThemeCategory;
  text: string;
  details: string | null;
  contextClaims: Array<{
    text: string;
    documentUrl: string;
    references: Array<{ unitId: string; page: number | null }>;
  }>;
  precision: MeasurePrecision | null;
  attribution: MeasureAttribution;
  reviewedAt: Date;
  publishedAt: Date;
  programEdition: {
    label: string;
    publishedAt: Date;
    documentUrl: string;
  } | null;
  candidate: {
    name: string;
    slug: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    party: string | null;
  };
  subtopics: Array<{
    slug: string;
    label: string;
    description: string;
  }>;
  sources: Array<{
    id: string;
    sourceKind: MeasureSourceKind;
    tier: SourceTier;
    url: string;
    page: string | null;
    publishedAt: Date;
  }>;
  votes: Array<{
    id: string;
    relation: VoteRelation;
    checkedAt: Date;
    institutionScope: Chamber[];
    scrutin: {
      id: string;
      slug: string | null;
      title: string;
      votingDate: Date;
      chamber: Chamber;
      sourceUrl: string | null;
    } | null;
  }>;
  relatedMeasures: Array<{
    slug: string;
    text: string;
    candidateName: string;
    candidateSlug: string;
    party: string | null;
    sharedSubtopics: Array<{ slug: string; label: string }>;
  }>;
};

async function loadPublicPresidentialMeasureDetail(electionSlug: string, measureSlug: string) {
  const row = await db.measure.findFirst({
    where: {
      slug: measureSlug,
      election: { slug: electionSlug },
      ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
    },
    select: {
      id: true,
      slug: true,
      theme: true,
      attribution: true,
      election: { select: { id: true, slug: true } },
      programEdition: {
        select: {
          label: true,
          publishedAt: true,
          documentUrl: true,
          publicationStatus: true,
        },
      },
      publishedRevisionId: true,
      publishedRevision: {
        select: {
          text: true,
          details: true,
          evidenceSnapshot: true,
          precision: true,
          reviewedAt: true,
          publishedAt: true,
          sources: {
            orderBy: { publishedAt: "asc" },
            select: {
              id: true,
              sourceKind: true,
              tier: true,
              url: true,
              page: true,
              publishedAt: true,
            },
          },
          subtopics: {
            where: { status: "APPROVED", subtopic: { active: true } },
            select: {
              subtopic: { select: { slug: true, label: true, description: true, sortOrder: true } },
            },
            orderBy: { subtopic: { sortOrder: "asc" } },
          },
        },
      },
      candidacy: {
        select: {
          id: true,
          candidateName: true,
          party: { select: { name: true, shortName: true } },
          politician: {
            select: {
              slug: true,
              photoUrl: true,
              blobPhotoUrl: true,
            },
          },
        },
      },
      voteLinks: {
        orderBy: { checkedAt: "desc" },
        select: {
          id: true,
          applicableRevisionId: true,
          linkKind: true,
          relation: true,
          checkedAt: true,
          institutionScope: true,
          scrutin: {
            select: {
              id: true,
              slug: true,
              title: true,
              votingDate: true,
              chamber: true,
              sourceUrl: true,
            },
          },
        },
      },
    },
  });
  const revision = row?.publishedRevision;
  const candidate = row?.candidacy;
  if (
    !row ||
    !revision ||
    !row.publishedRevisionId ||
    !revision.reviewedAt ||
    !revision.publishedAt ||
    !candidate?.politician
  ) {
    return null;
  }
  const publishedRevisionId = row.publishedRevisionId;
  const currentSubtopics = revision.subtopics.map(({ subtopic }) => subtopic);
  const currentSubtopicSlugs = new Set(currentSubtopics.map((subtopic) => subtopic.slug));

  const [contextAudit, relatedRows] = await Promise.all([
    revision.details === null
      ? Promise.resolve(null)
      : db.auditLog.findFirst({
          where: {
            action: GENERATED_CONTEXT_DRAFT_ACTION,
            entityType: "MeasureRevision",
            entityId: publishedRevisionId,
          },
          orderBy: { createdAt: "desc" },
          select: { changes: true },
        }),
    db.measure.findMany({
      where: {
        id: { not: row.id },
        electionId: row.election.id,
        theme: row.theme,
        ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
        ...(currentSubtopics.length > 0
          ? {
              publishedRevision: {
                is: {
                  ...PUBLIC_MEASURE_REVISION_WHERE,
                  subtopics: {
                    some: {
                      status: "APPROVED" as const,
                      subtopic: {
                        active: true,
                        slug: { in: currentSubtopics.map((subtopic) => subtopic.slug) },
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
      select: {
        slug: true,
        publishedRevision: {
          select: {
            text: true,
            subtopics: {
              where: { status: "APPROVED", subtopic: { active: true } },
              select: { subtopic: { select: { slug: true, label: true } } },
            },
          },
        },
        candidacy: {
          select: {
            candidateName: true,
            party: { select: { name: true, shortName: true } },
            politician: { select: { slug: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    }),
  ]);

  const evidence = readEvidenceSnapshot(revision.evidenceSnapshot);
  const contextClaims =
    contextAudit !== null && evidence.status === "VALID"
      ? readGeneratedContextClaims(contextAudit.changes).flatMap((claim) => {
          const references = claim.evidenceUnitIds.flatMap((unitId) => {
            const unit = evidence.snapshot.units.find((candidate) => candidate.unitId === unitId);
            return unit ? [{ unitId, page: unit.page }] : [];
          });
          return references.length > 0
            ? [
                {
                  text: claim.text,
                  documentUrl: evidence.snapshot.documentUrl,
                  references,
                },
              ]
            : [];
        })
      : [];

  // One proposal per other personality keeps this a navigation aid rather than another long list.
  // Alphabetical sorting is explicit and carries no editorial ranking.
  const relatedMeasures = relatedRows
    .flatMap((related) => {
      if (!related.publishedRevision || !related.candidacy?.politician) return [];
      return [
        {
          slug: related.slug,
          text: related.publishedRevision.text,
          candidateName: related.candidacy.candidateName,
          candidateSlug: related.candidacy.politician.slug,
          party: related.candidacy.party?.shortName ?? related.candidacy.party?.name ?? null,
          sharedSubtopics: related.publishedRevision.subtopics
            .filter(({ subtopic }) => currentSubtopicSlugs.has(subtopic.slug))
            .map(({ subtopic }) => ({ slug: subtopic.slug, label: subtopic.label })),
        },
      ];
    })
    .sort((a, b) => a.candidateName.localeCompare(b.candidateName, "fr"))
    .filter(
      (related, index, all) =>
        all.findIndex((candidate) => candidate.candidateSlug === related.candidateSlug) === index
    )
    .slice(0, 6);

  return {
    id: row.id,
    slug: row.slug,
    electionSlug: row.election.slug,
    theme: row.theme,
    text: revision.text,
    details: revision.details,
    contextClaims,
    precision: revision.precision,
    attribution: row.attribution,
    reviewedAt: revision.reviewedAt,
    publishedAt: revision.publishedAt,
    programEdition:
      row.programEdition?.publicationStatus === "PUBLISHED"
        ? {
            label: row.programEdition.label,
            publishedAt: row.programEdition.publishedAt,
            documentUrl: row.programEdition.documentUrl,
          }
        : null,
    candidate: {
      name: candidate.candidateName,
      slug: candidate.politician.slug,
      photoUrl: candidate.politician.photoUrl,
      blobPhotoUrl: candidate.politician.blobPhotoUrl,
      party: candidate.party?.shortName ?? candidate.party?.name ?? null,
    },
    subtopics: currentSubtopics.map(({ slug, label, description }) => ({
      slug,
      label,
      description,
    })),
    sources: revision.sources,
    votes: row.voteLinks.map((link) => ({
      id: link.id,
      relation: deriveVoteRelation(
        [
          {
            linkKind: link.linkKind,
            applicableRevisionId: link.applicableRevisionId,
            position: link.relation,
          },
        ],
        publishedRevisionId
      ),
      checkedAt: link.checkedAt,
      institutionScope: link.institutionScope,
      scrutin: link.scrutin,
    })),
    relatedMeasures,
  };
}

export const getPublicPresidentialMeasureDetail = cache(loadPublicPresidentialMeasureDetail);

export async function getPublicPresidentialMeasureSlugByLegacyId(
  electionSlug: string,
  measureId: string
): Promise<string | null> {
  const row = await db.measure.findFirst({
    where: {
      id: measureId,
      election: { slug: electionSlug },
      ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
    },
    select: { slug: true },
  });
  return row?.slug ?? null;
}
