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
