import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";

export type FeaturedSubtopic = {
  slug: string;
  label: string;
  theme: ThemeCategory;
  themeLabel: string;
  measureCount: number;
  candidacyCount: number;
};

export type FeaturedSubtopicMeasure = {
  id: string;
  withdrawal: unknown | null;
  candidacyId: string | null;
  theme: ThemeCategory;
  subtopics: Array<{ slug: string; label: string }>;
};

const FEATURED_SUBTOPIC_LIMIT = 10;
const FEATURED_SUBTOPICS_PER_THEME = 2;

/**
 * A compact browse entry point, never a word cloud. Font size and colour stay constant because a
 * frequency is a property of the current corpus, not a measure of political importance. Ranking by
 * distinct candidacies before raw volume also prevents one very long programme from filling the
 * home page with its own vocabulary. The per-theme cap keeps the entry points varied.
 */
export function selectFeaturedSubtopics(measures: FeaturedSubtopicMeasure[]): FeaturedSubtopic[] {
  const candidates = new Map<
    string,
    {
      slug: string;
      label: string;
      theme: ThemeCategory;
      measureIds: Set<string>;
      candidacyIds: Set<string>;
    }
  >();

  for (const measure of measures) {
    if (measure.withdrawal !== null || measure.candidacyId === null) continue;
    for (const subtopic of measure.subtopics) {
      const current = candidates.get(subtopic.slug) ?? {
        slug: subtopic.slug,
        label: subtopic.label,
        theme: measure.theme,
        measureIds: new Set<string>(),
        candidacyIds: new Set<string>(),
      };
      current.measureIds.add(measure.id);
      current.candidacyIds.add(measure.candidacyId);
      candidates.set(subtopic.slug, current);
    }
  }

  const ranked = [...candidates.values()].sort(
    (a, b) =>
      b.candidacyIds.size - a.candidacyIds.size ||
      b.measureIds.size - a.measureIds.size ||
      a.label.localeCompare(b.label, "fr")
  );
  const perTheme = new Map<ThemeCategory, number>();
  const selected: FeaturedSubtopic[] = [];

  for (const subtopic of ranked) {
    if ((perTheme.get(subtopic.theme) ?? 0) >= FEATURED_SUBTOPICS_PER_THEME) continue;
    selected.push({
      slug: subtopic.slug,
      label: subtopic.label,
      theme: subtopic.theme,
      themeLabel: THEME_CATEGORY_LABELS[subtopic.theme],
      measureCount: subtopic.measureIds.size,
      candidacyCount: subtopic.candidacyIds.size,
    });
    perTheme.set(subtopic.theme, (perTheme.get(subtopic.theme) ?? 0) + 1);
    if (selected.length === FEATURED_SUBTOPIC_LIMIT) break;
  }

  return selected;
}
