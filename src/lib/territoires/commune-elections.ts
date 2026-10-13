import type { CommuneDossier, MunicipalesBlock, SourceRef } from "@/lib/data/territoires";
import type { PresidentielleCommuneBlock } from "@/lib/data/territoires-presidentielle";

/**
 * Elections of a commune flattened into one shape, shared by the compact section of the commune
 * page and by the dedicated page (#1052). Pure: no data access, no rendering.
 *
 * Only the scrutins the base holds for a commune exist here. A type without data is absent from
 * the list, never a zero or an empty row.
 */

export type ScrutinType = "MUNICIPALES" | "PRESIDENTIELLE";

export const SCRUTIN_TYPE_LABELS: Record<ScrutinType, string> = {
  MUNICIPALES: "Municipales",
  PRESIDENTIELLE: "Présidentielle",
};

/** Query-string value of each type on the dedicated page. */
export const SCRUTIN_TYPE_PARAMS: Record<ScrutinType, string> = {
  MUNICIPALES: "municipales",
  PRESIDENTIELLE: "presidentielle",
};

export interface ScrutinRow {
  key: string;
  label: string;
  /** Second line under the label (head of list), null when there is none. */
  detail: string | null;
  pct: number | null;
  votes: number | null;
  /** Outcome stated by the source ("élue au 1er tour"), null when none. */
  status: string | null;
}

export interface ScrutinTourSource {
  label: string;
  url: string | null;
  /** Publication date of this round's dataset, null when the source does not say. */
  publishedAt: string | null;
}

export interface ScrutinTour {
  round: 1 | 2;
  date: string | null;
  /** Dataset of this round when it has its own, so each figure links to the file it comes from. */
  source: ScrutinTourSource | null;
  participationRate: number | null;
  registeredVoters: number | null;
  actualVoters: number | null;
  validVotes: number | null;
  /** Sorted by share, descending. */
  rows: ScrutinRow[];
}

export interface CommuneScrutin {
  type: ScrutinType;
  slug: string;
  title: string;
  /** Date of the first round, null when unknown. Orders the list. */
  date: string | null;
  /** What a row is called in "Autres ... (n)": lists for the municipales, candidates otherwise. */
  rowsNoun: "listes" | "candidats";
  /** Round 1 then round 2, only the rounds with at least one row. */
  tours: ScrutinTour[];
  source: SourceRef;
  /** Import date when the source records it, null otherwise. */
  importedAt: string | null;
  /** Full results of this ballot elsewhere on the site. */
  resultsHref: string;
}

function municipales(block: MunicipalesBlock | null, inseeCode: string): CommuneScrutin | null {
  if (!block || block.state !== "DISPONIBLE") return null;
  const tours = ([1, 2] as const).flatMap((round): ScrutinTour[] => {
    const rows = block.listes
      .map((l, i) => ({
        pct: round === 1 ? l.round1Pct : l.round2Pct,
        row: {
          key: `${l.listName ?? l.teteDeListe.name}-${i}`,
          label: l.listName ?? `Liste de ${l.teteDeListe.name}`,
          detail: l.listName ? `tête de liste ${l.teteDeListe.name}` : null,
          status:
            round === 1 && l.electionAuPremierTour === "ELUE"
              ? "élue au 1er tour"
              : round === 2 && l.elueAuSecondTour
                ? "élue au 2d tour"
                : null,
        },
      }))
      .filter((r) => r.pct != null)
      .sort((a, b) => (b.pct as number) - (a.pct as number))
      .map((r) => ({ ...r.row, pct: r.pct, votes: null }));
    if (rows.length === 0) return [];
    const part = block.participation.find((p) => p.round === round);
    return [
      {
        round,
        date: round === 1 ? block.round1Date : block.round2Date,
        source: null,
        participationRate: part?.participationRate ?? null,
        registeredVoters: part?.registeredVoters ?? null,
        actualVoters: part?.actualVoters ?? null,
        validVotes: part?.validVotes ?? null,
        rows,
      },
    ];
  });
  if (tours.length === 0) return null;
  return {
    type: "MUNICIPALES",
    slug: block.electionSlug,
    title: "Municipales 2026",
    date: block.round1Date,
    rowsNoun: "listes",
    tours,
    source: block.source,
    importedAt: null,
    // Full lists and candidates of this commune, not the national page.
    resultsHref: `/elections/${block.electionSlug}/communes/${inseeCode}`,
  };
}

function sourceOfRound(block: PresidentielleCommuneBlock, round: 1 | 2): ScrutinTourSource | null {
  const s = block.sources.find((x) => x.round === round);
  return s ? { label: s.label, url: s.url, publishedAt: s.publishedAt } : null;
}

function presidentielle(block: PresidentielleCommuneBlock): CommuneScrutin | null {
  const tours = block.tours
    .filter((t) => t.candidats.length > 0)
    .map(
      (t): ScrutinTour => ({
        round: t.round,
        date: t.date,
        source: sourceOfRound(block, t.round),
        participationRate: t.participationRate,
        registeredVoters: t.registeredVoters,
        actualVoters: t.actualVoters,
        validVotes: t.validVotes,
        rows: t.candidats.map((c) => ({
          key: c.name,
          label: c.name,
          detail: null,
          pct: c.pct,
          votes: c.votes,
          status: null,
        })),
      })
    );
  if (tours.length === 0) return null;
  return {
    type: "PRESIDENTIELLE",
    slug: block.electionSlug,
    title: block.title,
    date: block.round1Date,
    rowsNoun: "candidats",
    tours,
    source: {
      label: block.sources[0]?.label ?? "ministère de l'Intérieur",
      url: block.sources[0]?.url ?? null,
    },
    importedAt: block.importedAt,
    resultsHref: `/elections/${block.electionSlug}`,
  };
}

/**
 * One list or one candidate of a past municipal ballot (2020, 2014), as read by the existing
 * per-commune readers. Party labels are deliberately absent from this shape.
 */
export interface HistoricalMunicipalesEntry {
  /** List name, or the candidate's name on a plurinominal ballot (communes under 1,000). */
  label: string;
  isNamedList: boolean;
  candidateName: string;
  round1Pct: number | null;
  round2Pct: number | null;
  isElected: boolean;
}

export interface HistoricalMunicipales {
  inseeCode: string;
  slug: string;
  year: number;
  round1Date: string | null;
  round2Date: string | null;
  entries: HistoricalMunicipalesEntry[];
}

/**
 * Past municipal ballot of a commune. No participation: the base holds none per commune for
 * these years, which the page says as "non établi" rather than leaving a gap.
 */
export function historicalMunicipales(input: HistoricalMunicipales): CommuneScrutin | null {
  const hasRound2 = input.entries.some((e) => e.round2Pct != null);
  const decidingRound: 1 | 2 = hasRound2 ? 2 : 1;
  const source: ScrutinTourSource = {
    label: `data.gouv.fr, résultats des élections municipales ${input.year}`,
    url: null,
    publishedAt: null,
  };
  const tours = ([1, 2] as const).flatMap((round): ScrutinTour[] => {
    const rows = input.entries
      .map((e, i) => ({
        pct: round === 1 ? e.round1Pct : e.round2Pct,
        row: {
          key: `${e.label}-${i}`,
          label: e.label,
          detail: e.isNamedList ? `tête de liste ${e.candidateName}` : null,
          status: round === decidingRound && e.isElected ? (e.isNamedList ? "élue" : "élu") : null,
        },
      }))
      .filter((r) => r.pct != null)
      .sort((a, b) => (b.pct as number) - (a.pct as number))
      .map((r) => ({ ...r.row, pct: r.pct, votes: null }));
    if (rows.length === 0) return [];
    return [
      {
        round,
        date: round === 1 ? input.round1Date : input.round2Date,
        source,
        participationRate: null,
        registeredVoters: null,
        actualVoters: null,
        validVotes: null,
        rows,
      },
    ];
  });
  if (tours.length === 0) return null;
  return {
    type: "MUNICIPALES",
    slug: input.slug,
    title: `Municipales ${input.year}`,
    date: input.round1Date,
    rowsNoun: input.entries.some((e) => e.isNamedList) ? "listes" : "candidats",
    tours,
    source,
    importedAt: null,
    resultsHref: `/elections/${input.slug}/communes/${input.inseeCode}`,
  };
}

/** Every scrutin the commune has results for, most recent first. */
export function communeScrutins(
  elections: CommuneDossier["elections"],
  inseeCode: string,
  historique: CommuneScrutin[] = []
): CommuneScrutin[] {
  const all = [
    municipales(elections.municipales2026, inseeCode),
    ...historique,
    ...elections.presidentielles.blocks.map(presidentielle),
  ].filter((s): s is CommuneScrutin => s !== null);
  return all.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** The latest scrutin of each type: what the commune page folds into one line per type. */
export function latestScrutinPerType(scrutins: CommuneScrutin[]): CommuneScrutin[] {
  const seen = new Set<ScrutinType>();
  return scrutins.filter((s) => {
    if (seen.has(s.type)) return false;
    seen.add(s.type);
    return true;
  });
}

/** Round shown on the folded line: the last one held, which decides the ballot. */
export function decidingTour(scrutin: CommuneScrutin): ScrutinTour {
  // A scrutin is only built with at least one tour (see municipales() and presidentielle()).
  return scrutin.tours[scrutin.tours.length - 1] as ScrutinTour;
}
