import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { db } from "@/lib/db";
import {
  PUBLIC_MEASURE_REVISION_WHERE,
  PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
} from "@/lib/presidentielle/publication";
import { themeToSlug } from "@/lib/presidentielle/themes";
import { isIndexableReaderGuide } from "@/lib/seo/reader-guide-robots";

const PUBLIC_READER_GUIDE_WHERE = {
  active: true,
  publicationStatus: "PUBLISHED" as const,
  reviewedAt: { not: null },
};

export type PresidentialReaderGuideMeasure = {
  slug: string;
  text: string;
  reviewedAt: Date;
  theme: ThemeCategory;
  themeLabel: string;
  themeSlug: string;
  candidateName: string;
  candidateSlug: string;
  partyLabel: string | null;
};

export type PresidentialReaderGuideIndexItem = {
  slug: string;
  label: string;
  definition: string;
  aliases: string[];
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
  reviewedAt: Date;
  updatedAt: Date;
  indexable: boolean;
  candidateCount: number;
  themes: Array<{
    theme: ThemeCategory;
    label: string;
    slug: string;
    measureCount: number;
  }>;
  measures: PresidentialReaderGuideMeasure[];
};

/**
 * Plain loader shared by pages and the sitemap. It starts from the public measure authority so an
 * approved mention on an old, draft or otherwise unreachable revision can never create a public
 * glossary page.
 */
export async function loadPresidentialReaderGuideIndex(
  electionId: string
): Promise<PresidentialReaderGuideIndexItem[]> {
  const measures = await db.measure.findMany({
    where: {
      electionId,
      ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
      publishedRevision: {
        is: {
          ...PUBLIC_MEASURE_REVISION_WHERE,
          readerGuideMentions: {
            some: { status: "APPROVED", guide: { is: PUBLIC_READER_GUIDE_WHERE } },
          },
        },
      },
    },
    select: {
      slug: true,
      theme: true,
      publishedRevision: {
        select: {
          text: true,
          reviewedAt: true,
          readerGuideMentions: {
            where: { status: "APPROVED", guide: { is: PUBLIC_READER_GUIDE_WHERE } },
            select: {
              guide: {
                select: {
                  slug: true,
                  label: true,
                  definition: true,
                  aliases: true,
                  sourceUrl: true,
                  sourceLabel: true,
                  sourcePublisher: true,
                  reviewedAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
      candidacy: {
        select: {
          candidateName: true,
          politician: { select: { slug: true } },
          party: { select: { name: true, shortName: true } },
        },
      },
    },
    orderBy: [{ candidacy: { candidateName: "asc" } }, { slug: "asc" }],
  });

  const guides = new Map<
    string,
    Omit<PresidentialReaderGuideIndexItem, "candidateCount" | "themes" | "indexable"> & {
      measureSlugs: Set<string>;
      candidateSlugs: Set<string>;
      themeCounts: Map<ThemeCategory, number>;
    }
  >();

  for (const measure of measures) {
    const revision = measure.publishedRevision;
    const candidacy = measure.candidacy;
    if (!revision?.reviewedAt || !candidacy?.politician) continue;
    const linkedMeasure: PresidentialReaderGuideMeasure = {
      slug: measure.slug,
      text: revision.text,
      reviewedAt: revision.reviewedAt,
      theme: measure.theme,
      themeLabel: THEME_CATEGORY_LABELS[measure.theme],
      themeSlug: themeToSlug(measure.theme),
      candidateName: candidacy.candidateName,
      candidateSlug: candidacy.politician.slug,
      partyLabel: candidacy.party?.shortName ?? candidacy.party?.name ?? null,
    };

    for (const mention of revision.readerGuideMentions) {
      const guide = mention.guide;
      if (!guide?.reviewedAt) continue;
      const current = guides.get(guide.slug) ?? {
        slug: guide.slug,
        label: guide.label,
        definition: guide.definition,
        aliases: guide.aliases,
        sourceUrl: guide.sourceUrl,
        sourceLabel: guide.sourceLabel,
        sourcePublisher: guide.sourcePublisher,
        reviewedAt: guide.reviewedAt,
        updatedAt: guide.updatedAt,
        measures: [],
        measureSlugs: new Set<string>(),
        candidateSlugs: new Set<string>(),
        themeCounts: new Map<ThemeCategory, number>(),
      };
      // One revision can mention both an acronym and its expanded form. They may resolve to the
      // same guide, but the public page must count and render the measure only once.
      if (!current.measureSlugs.has(linkedMeasure.slug)) {
        current.measureSlugs.add(linkedMeasure.slug);
        current.measures.push(linkedMeasure);
        current.candidateSlugs.add(linkedMeasure.candidateSlug);
        current.themeCounts.set(measure.theme, (current.themeCounts.get(measure.theme) ?? 0) + 1);
      }
      if (linkedMeasure.reviewedAt > current.updatedAt)
        current.updatedAt = linkedMeasure.reviewedAt;
      guides.set(guide.slug, current);
    }
  }

  return [...guides.values()]
    .map(({ measureSlugs: _measureSlugs, candidateSlugs, themeCounts, ...guide }) => ({
      ...guide,
      candidateCount: candidateSlugs.size,
      themes: [...themeCounts.entries()]
        .map(([theme, measureCount]) => ({
          theme,
          label: THEME_CATEGORY_LABELS[theme],
          slug: themeToSlug(theme),
          measureCount,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr")),
      indexable: isIndexableReaderGuide({
        active: true,
        published: true,
        reviewedAt: guide.reviewedAt,
        sourceUrl: guide.sourceUrl,
        definition: guide.definition,
        publicMeasureCount: guide.measures.length,
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export const getPresidentialReaderGuideIndex = cache(async function getPresidentialReaderGuideIndex(
  electionSlug: string
): Promise<PresidentialReaderGuideIndexItem[]> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (!election) return [];
  return getPresidentialReaderGuideIndexCached(election.id);
});

async function getPresidentialReaderGuideIndexCached(
  electionId: string
): Promise<PresidentialReaderGuideIndexItem[]> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  cacheLife("synced");
  return loadPresidentialReaderGuideIndex(electionId);
}

export async function getPresidentialReaderGuide(
  electionSlug: string,
  guideSlug: string
): Promise<PresidentialReaderGuideIndexItem | null> {
  const guides = await getPresidentialReaderGuideIndex(electionSlug);
  return guides.find((guide) => guide.slug === guideSlug) ?? null;
}
