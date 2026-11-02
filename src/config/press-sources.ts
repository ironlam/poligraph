/**
 * Feeds whose articles may appear next to a candidate on the presidential hub, with the outlet
 * name shown to readers. The verified outlets of AGENTS.md §2.4 that we ingest, plus the two
 * parliamentary channels and Ouest-France (editorial decision): aggregators (Google News) and
 * other outlets stay on /presse only.
 */
export const HUB_PRESS_FEEDS = {
  lemonde: "Le Monde",
  lefigaro: "Le Figaro",
  franceinfo: "Franceinfo",
  liberation: "Libération",
  mediapart: "Mediapart",
  publicsenat: "Public Sénat",
  lcp: "LCP",
  ouestfrance: "Ouest-France",
} as const satisfies Record<string, string>;

export type HubPressFeedId = keyof typeof HUB_PRESS_FEEDS;

export const HUB_PRESS_FEED_IDS = Object.keys(HUB_PRESS_FEEDS) as HubPressFeedId[];
