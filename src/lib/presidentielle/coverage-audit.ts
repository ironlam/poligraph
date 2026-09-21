/**
 * Editorial coverage of the presidential candidacies, classified from database state alone.
 *
 * Four questions are asked of every declared candidacy: is there a programme document behind its
 * measures, does it have measures at all, is its synthesis still true, and are its theme syntheses
 * still in step with the measures they summarise. Only the first two can be answered from outside,
 * because a missing document is invisible by definition; the other two have an authority in this
 * codebase and cost nothing to evaluate. {@link needsWebResearch} is where that split lives, and it
 * is what keeps a sweep over thirty-one candidacies from turning into thirty-one web searches.
 *
 * Deliberately free of any database import. The Prisma client is constructed at import time and the
 * unit CI has no DATABASE_URL, so a module reachable from a plain unit test cannot reach for `db`.
 * Reads belong to the caller, which hands the counts and the already-resolved theme states down.
 */

import type { ThemeCategory } from "@/generated/prisma";
import { isSynthesisContradictedByMeasures } from "./candidate-synthesis";
import type { ThemeSynthesisEditorialState } from "./candidacy-theme-synthesis";

export type CoverageFindingKind =
  | "PROGRAMME_ABSENT"
  | "AUCUNE_MESURE"
  | "SYNTHESE_ABSENTE"
  | "SYNTHESE_DEMENTIE"
  | "THEME_SYNTHESE_MANQUANTE"
  | "THEME_SYNTHESE_OBSOLETE"
  | "THEME_SYNTHESE_EN_ATTENTE";

/** The four axes of the report, in the order a reviewer works through them. */
export type CoverageAxis = "PROGRAMMES" | "MESURES" | "SYNTHESE" | "SYNTHESES_THEMATIQUES";

const AXIS_BY_KIND: Record<CoverageFindingKind, CoverageAxis> = {
  PROGRAMME_ABSENT: "PROGRAMMES",
  AUCUNE_MESURE: "MESURES",
  SYNTHESE_ABSENTE: "SYNTHESE",
  SYNTHESE_DEMENTIE: "SYNTHESE",
  THEME_SYNTHESE_MANQUANTE: "SYNTHESES_THEMATIQUES",
  THEME_SYNTHESE_OBSOLETE: "SYNTHESES_THEMATIQUES",
  THEME_SYNTHESE_EN_ATTENTE: "SYNTHESES_THEMATIQUES",
};

/**
 * Whether searching the web can add anything to a finding.
 *
 * True only where the gap is an absence of something that may exist outside this site. A synthesis
 * that contradicts its own measures, or a theme whose corpus moved, is a fact about our data: the
 * repair is a regeneration, and no source on the internet changes the verdict.
 */
const WEB_RESEARCH_BY_KIND: Record<CoverageFindingKind, boolean> = {
  PROGRAMME_ABSENT: true,
  AUCUNE_MESURE: true,
  SYNTHESE_ABSENTE: false,
  SYNTHESE_DEMENTIE: false,
  THEME_SYNTHESE_MANQUANTE: false,
  THEME_SYNTHESE_OBSOLETE: false,
  THEME_SYNTHESE_EN_ATTENTE: false,
};

export function needsWebResearch(kind: CoverageFindingKind): boolean {
  return WEB_RESEARCH_BY_KIND[kind];
}

export function coverageAxis(kind: CoverageFindingKind): CoverageAxis {
  return AXIS_BY_KIND[kind];
}

export type CoverageFinding = {
  kind: CoverageFindingKind;
  axis: CoverageAxis;
  /** One line, already readable in a terminal report. */
  detail: string;
  /** Present on theme findings only, in catalogue order as received. */
  themes?: ThemeCategory[];
};

export type CandidacyCoverageInput = {
  candidateName: string;
  politicianSlug: string | null;
  /** Published, reviewed, non-withdrawn measures: the ones the fiche actually shows. */
  measureCount: number;
  programEditionCount: number;
  publishedProgramEditionCount: number;
  synthesis: string | null;
  synthesisGeneratedAt: Date | null;
  /** Publication date of the oldest measure currently shown. Null when none is shown. */
  firstMeasurePublishedAt: Date | null;
  /**
   * One entry per theme that carries measures, with its state already resolved by
   * `getThemeSynthesisState`. Resolving it here would mean recomputing a corpus fingerprint, which
   * needs the measure texts, which is a read.
   */
  themes: Array<{ theme: ThemeCategory; state: ThemeSynthesisEditorialState }>;
  /** Stored theme syntheses, read for their lineage only. Never a staleness signal. */
  storedThemeSyntheses: Array<{ theme: ThemeCategory; promptVersion: string }>;
};

export type CandidacyCoverage = {
  candidateName: string;
  politicianSlug: string | null;
  findings: CoverageFinding[];
  /**
   * How many stored theme syntheses carry each prompt version, reported and never judged.
   *
   * Stored versions are composite editorial labels ("candidacy-theme-synthesis-v4-editorial-v2"),
   * not the bare generation constant, so comparing them by equality marks almost every candidacy
   * stale while every corpus fingerprint matches. Whether an older lineage deserves a new pass is
   * an editorial call on a whole cohort, not a defect on one candidacy.
   */
  promptLineage: Record<string, number>;
  /** True when at least one finding is one the web could answer. Drives the targeted second pass. */
  webResearchWorthwhile: boolean;
};

/** Theme states worth a finding, in the order a reviewer handles them. */
const REPORTED_THEME_STATES: Array<{
  state: ThemeSynthesisEditorialState;
  kind: CoverageFindingKind;
  detail: (count: number) => string;
}> = [
  {
    state: "MISSING",
    kind: "THEME_SYNTHESE_MANQUANTE",
    detail: (n) => `${n} thème(s) portent des mesures sans synthèse thématique`,
  },
  {
    state: "OBSOLETE",
    kind: "THEME_SYNTHESE_OBSOLETE",
    detail: (n) => `${n} synthèse(s) thématique(s) ne correspondent plus à leur corpus de mesures`,
  },
  {
    state: "PENDING_REVIEW",
    kind: "THEME_SYNTHESE_EN_ATTENTE",
    detail: (n) => `${n} synthèse(s) thématique(s) attendent une relecture`,
  },
];

export function classifyCandidacyCoverage(input: CandidacyCoverageInput): CandidacyCoverage {
  const findings: CoverageFinding[] = [];

  const add = (kind: CoverageFindingKind, detail: string, themes?: ThemeCategory[]) => {
    findings.push({ kind, axis: AXIS_BY_KIND[kind], detail, ...(themes ? { themes } : {}) });
  };

  if (input.measureCount === 0) {
    // Nothing else is worth saying about a candidacy with no programme on file: it has no document
    // to miss and no corpus for a synthesis to fall behind.
    add("AUCUNE_MESURE", "candidature déclarée sans aucune mesure publiée");
  } else if (input.publishedProgramEditionCount === 0 && input.programEditionCount === 0) {
    add(
      "PROGRAMME_ABSENT",
      `${input.measureCount} mesures publiées sans aucune édition de programme rattachée`
    );
  }

  if (input.synthesis === null) {
    add("SYNTHESE_ABSENTE", "aucune synthèse de candidature");
  } else if (
    isSynthesisContradictedByMeasures({
      generatedAt: input.synthesisGeneratedAt,
      firstMeasurePublishedAt: input.firstMeasurePublishedAt,
    })
  ) {
    add(
      "SYNTHESE_DEMENTIE",
      input.synthesisGeneratedAt === null
        ? "synthèse sans date de génération, démentie dès qu'une mesure existe"
        : "synthèse antérieure à la plus ancienne mesure affichée"
    );
  }

  for (const { state, kind, detail } of REPORTED_THEME_STATES) {
    const themes = input.themes.filter((entry) => entry.state === state).map((e) => e.theme);
    if (themes.length > 0) add(kind, detail(themes.length), themes);
  }

  const promptLineage: Record<string, number> = {};
  for (const stored of input.storedThemeSyntheses) {
    promptLineage[stored.promptVersion] = (promptLineage[stored.promptVersion] ?? 0) + 1;
  }

  return {
    candidateName: input.candidateName,
    politicianSlug: input.politicianSlug,
    findings,
    promptLineage,
    webResearchWorthwhile: findings.some((finding) => needsWebResearch(finding.kind)),
  };
}
