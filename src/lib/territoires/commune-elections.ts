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

export interface ScrutinTour {
  round: 1 | 2;
  date: string | null;
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

function presidentielle(block: PresidentielleCommuneBlock): CommuneScrutin | null {
  const tours = block.tours
    .filter((t) => t.candidats.length > 0)
    .map(
      (t): ScrutinTour => ({
        round: t.round,
        date: t.date,
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

/** Every scrutin the commune has results for, most recent first. */
export function communeScrutins(
  elections: CommuneDossier["elections"],
  inseeCode: string
): CommuneScrutin[] {
  const all = [
    municipales(elections.municipales2026, inseeCode),
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
