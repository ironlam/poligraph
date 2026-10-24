import type { Chamber } from "@/generated/prisma";

export const ROUTES = {
  parlement: "/parlement",
  votes: "/parlement/votes",
  voteDetail: (slug: string) => `/parlement/votes/${slug}`,
  votesToday: "/parlement/votes/aujourd-hui",
  voteStats: "/parlement/votes/stats",
  voteThemes: "/parlement/votes/themes",
  voteTheme: (slug: string) => `/parlement/votes/themes/${slug}`,
  dossiers: "/parlement/dossiers",
  dossierDetail: (slug: string) => `/parlement/dossiers/${slug}`,
  groupes: "/parlement/groupes",
  groupeDetail: (slug: string) => `/parlement/groupes/${slug}`,
  assembleeNationale: "/parlement/assemblee-nationale",
  senat: "/parlement/senat",
  parcoursLegislatif: "/parlement/parcours-legislatif",
  glossaire: "/parlement/glossaire",
  legislatures: "/parlement/assemblee/legislatures",
  legislature: (n: number) => `/parlement/assemblee/legislatures/${n}`,
} as const;

/** Stable URLs keep each statistics section server-rendered and indexable. */
export const STATS_SECTIONS = {
  judiciaire: { path: "/statistiques", label: "Judiciaire", shortLabel: "Justice" },
  factchecks: {
    path: "/statistiques/factchecks",
    label: "Fact-checking",
    shortLabel: "Facts",
  },
  legislatif: { path: "/statistiques/legislatif", label: "Législatif", shortLabel: "Lois" },
  participation: {
    path: "/statistiques/participation",
    label: "Participation aux scrutins publics",
    shortLabel: "Votes",
  },
  territoires: {
    path: "/statistiques/territoires",
    label: "Territoires",
    shortLabel: "Territoires",
  },
} as const;

export type StatsTab = keyof typeof STATS_SECTIONS;
export const STATS_TABS = Object.keys(STATS_SECTIONS) as StatsTab[];
export const DEFAULT_STATS_TAB: StatsTab = "judiciaire";

export function statsHref(tab: StatsTab, params?: { chamber?: Chamber }): string {
  const search = new URLSearchParams();
  if (params?.chamber) search.set("chamber", params.chamber);
  const qs = search.toString();
  const path = STATS_SECTIONS[tab].path;
  return qs ? `${path}?${qs}` : path;
}
