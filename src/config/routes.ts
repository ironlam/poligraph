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
export const STATS_TABS = ["judiciaire", "factchecks", "legislatif", "participation"] as const;
export type StatsTab = (typeof STATS_TABS)[number];
export const DEFAULT_STATS_TAB: StatsTab = "judiciaire";

export const STATS_PATHS: Record<StatsTab, string> = {
  judiciaire: "/statistiques",
  factchecks: "/statistiques/factchecks",
  legislatif: "/statistiques/legislatif",
  participation: "/statistiques/participation",
};

/**
 * Build a statistics URL. `chamber` is only read by the participation section.
 */
export function statsHref(tab: StatsTab, params?: { chamber?: Chamber }): string {
  const search = new URLSearchParams();
  if (params?.chamber) search.set("chamber", params.chamber);
  const qs = search.toString();
  return qs ? `${STATS_PATHS[tab]}?${qs}` : STATS_PATHS[tab];
}
