import "server-only";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  computeThemeCorpusFingerprint,
  computeThemeSynthesisContentFingerprint,
  getThemeSynthesisState,
  indexThemeSynthesisMeasures,
  readThemeSynthesisClaims,
  type ThemeSynthesisEditorialState,
  type ThemeSynthesisInput,
} from "@/lib/presidentielle/candidacy-theme-synthesis";
import { PUBLIC_CURRENT_MEASURE_WHERE } from "@/lib/presidentielle/publication";
import { PRESIDENTIELLE_2027_SLUG, THEMES_IN_ORDER } from "@/lib/presidentielle/themes";

export type AdminThemeSynthesisRow = {
  theme: ThemeCategory;
  measureCount: number;
  measures: Array<{
    id: string;
    ref: string;
    text: string;
  }>;
  currentCorpusFingerprint: string;
  state: ThemeSynthesisEditorialState;
  synthesis: null | {
    id: string;
    text: string;
    corpusFingerprint: string;
    contentFingerprint: string;
    model: string;
    generatedAt: Date;
    validatedAt: Date | null;
    claims: Array<{ text: string; measureRefs: string[] }>;
  };
};

export type AdminCandidacyThemeSyntheses = {
  candidacyId: string;
  candidateName: string;
  politicianSlug: string;
  themes: AdminThemeSynthesisRow[];
};

export async function getAdminCandidacyThemeSyntheses(
  politicianSlug: string
): Promise<AdminCandidacyThemeSyntheses | null> {
  const candidacy = await db.candidacy.findFirst({
    where: {
      politician: { slug: politicianSlug },
      election: { slug: PRESIDENTIELLE_2027_SLUG },
    },
    select: {
      id: true,
      candidateName: true,
      politician: { select: { slug: true } },
      presidentialData: {
        select: {
          id: true,
          themeSyntheses: {
            select: {
              id: true,
              theme: true,
              text: true,
              evidence: true,
              corpusFingerprint: true,
              model: true,
              promptVersion: true,
              status: true,
              generatedAt: true,
              validatedAt: true,
            },
          },
        },
      },
    },
  });
  if (!candidacy?.politician?.slug || !candidacy.presidentialData) return null;

  const measures = await db.measure.findMany({
    where: { candidacyId: candidacy.id, ...PUBLIC_CURRENT_MEASURE_WHERE },
    select: {
      id: true,
      theme: true,
      publishedRevisionId: true,
      publishedRevision: { select: { text: true, details: true } },
    },
    orderBy: { id: "asc" },
  });
  const byTheme = new Map<ThemeCategory, ThemeSynthesisInput["measures"]>();
  for (const measure of measures) {
    if (!measure.publishedRevision || !measure.publishedRevisionId) continue;
    const bucket = byTheme.get(measure.theme) ?? [];
    bucket.push({
      id: measure.id,
      revisionId: measure.publishedRevisionId,
      text: measure.publishedRevision.text,
      details: measure.publishedRevision.details,
    });
    byTheme.set(measure.theme, bucket);
  }
  const stored = new Map(
    candidacy.presidentialData.themeSyntheses.map((synthesis) => [synthesis.theme, synthesis])
  );

  return {
    candidacyId: candidacy.id,
    candidateName: candidacy.candidateName,
    politicianSlug: candidacy.politician.slug,
    themes: THEMES_IN_ORDER.flatMap((theme) => {
      const themeMeasures = byTheme.get(theme);
      if (!themeMeasures?.length) return [];
      const indexedMeasures = indexThemeSynthesisMeasures(themeMeasures);
      const currentCorpusFingerprint = computeThemeCorpusFingerprint({
        theme,
        measures: themeMeasures,
      });
      const synthesis = stored.get(theme) ?? null;
      return [
        {
          theme,
          measureCount: themeMeasures.length,
          measures: indexedMeasures.map((measure) => ({
            id: measure.id,
            ref: measure.ref,
            text: measure.text,
          })),
          currentCorpusFingerprint,
          state: getThemeSynthesisState(synthesis, currentCorpusFingerprint),
          synthesis: synthesis
            ? (() => {
                const claims = readThemeSynthesisClaims(synthesis.evidence);
                return {
                  id: synthesis.id,
                  text: synthesis.text,
                  corpusFingerprint: synthesis.corpusFingerprint,
                  contentFingerprint: computeThemeSynthesisContentFingerprint({
                    text: synthesis.text,
                    claims,
                    model: synthesis.model,
                    promptVersion: synthesis.promptVersion,
                  }),
                  model: synthesis.model,
                  generatedAt: synthesis.generatedAt,
                  validatedAt: synthesis.validatedAt,
                  claims,
                };
              })()
            : null,
        },
      ];
    }),
  };
}
