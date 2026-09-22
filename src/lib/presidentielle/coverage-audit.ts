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
import { isPresidentialTheme } from "./themes";
import type { ThemeSynthesisEditorialState } from "./candidacy-theme-synthesis";

export type CoverageFindingKind =
  | "PROGRAMME_ABSENT"
  | "PROGRAMME_PARTI_NON_RATTACHE"
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
  PROGRAMME_PARTI_NON_RATTACHE: "PROGRAMMES",
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
  // The document is already in the database, one join away. Searching the web for it was the
  // defect this finding exists to name: on the audit's first real run, all nine candidacies
  // reported as missing a programme had editions filed under their party.
  PROGRAMME_PARTI_NON_RATTACHE: false,
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
  /**
   * Measures matching the public measure predicate, counted whatever the extension's publication
   * status. Not "what the fiche shows": a candidacy whose extension is still DRAFT shows nothing at
   * all, and an audit that adopted the fiche's gate would report no work precisely where the work
   * is. Read it as "what the fiche would show once opened".
   */
  measureCount: number;
  programEditionCount: number;
  publishedProgramEditionCount: number;
  /**
   * Party-owned editions of the same election that this candidacy's own measures actually cite.
   *
   * Not "editions of the party": matching on `partyId` alone would make one document vouch for
   * every contender of that party, and would let a past legislative platform stand in for a
   * presidential programme. `runV6ShadowImport` refuses that same inference, requiring an explicit
   * `partyProgramCandidacyId` and reporting anything else as "plateforme de parti non attribuable
   * automatiquement". A document cited by this candidacy's reviewed measure sources is evidence,
   * not an inference, which is why the count is built from citations. See
   * {@link isEditionCitedBySources}.
   */
  citedPartyProgramEditionCount: number;
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

/**
 * Whether a programme document is cited by a candidacy's own measure sources.
 *
 * Prefix matching on a segment boundary, so `/doc/` never vouches for `/document-bis/`, and a bare
 * domain root only counts when cited verbatim: a site root would otherwise stand as evidence for
 * every page it hosts, which is exactly the loose match this function exists to prevent.
 */
export function isEditionCitedBySources(
  documentUrl: string,
  sourceUrls: readonly string[]
): boolean {
  const normalize = (url: string) => url.replace(/\/+$/, "");
  const document = normalize(documentUrl);
  let path: string;
  try {
    path = new URL(documentUrl).pathname;
  } catch {
    return false;
  }
  const isBareRoot = path === "" || path === "/";
  return sourceUrls.some((source) => {
    const candidate = normalize(source);
    if (candidate === document) return true;
    return isBareRoot ? false : candidate.startsWith(`${document}/`);
  });
}

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
    // A draft edition on either owner still means the document has been found, so neither branch
    // filters on publication status: the question here is whether we hold the text at all.
    if (input.citedPartyProgramEditionCount > 0) {
      add(
        "PROGRAMME_PARTI_NON_RATTACHE",
        `${input.citedPartyProgramEditionCount} édition(s) du parti citée(s) par ses mesures, aucune rattachée à la candidature`
      );
    } else {
      add(
        "PROGRAMME_ABSENT",
        `${input.measureCount} mesures publiées et aucune édition de programme, ni pour la candidature ni pour son parti`
      );
    }
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

  // Only the presidential catalogue counts. SOCIAL_TRAVAIL sits in the Prisma enum but is out of
  // `THEMES_IN_ORDER` on purpose (it stays parliamentary), and no hub surface iterates outside that
  // list. A finding on such a theme would name work nobody can publish and no reader would see.
  const catalogueThemes = input.themes.filter((entry) => isPresidentialTheme(entry.theme));
  for (const { state, kind, detail } of REPORTED_THEME_STATES) {
    const themes = catalogueThemes.filter((entry) => entry.state === state).map((e) => e.theme);
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
