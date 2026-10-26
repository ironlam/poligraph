/**
 * Feeds whose articles may appear next to a candidate on the presidential hub, with the outlet
 * name shown to readers. Restricted to the verified outlets of AGENTS.md §2.4 that we ingest:
 * aggregators (Google News) and outlets outside that list stay on /presse only.
 */
export const HUB_PRESS_FEEDS = {
  lemonde: "Le Monde",
  lefigaro: "Le Figaro",
  franceinfo: "Franceinfo",
  liberation: "Libération",
  mediapart: "Mediapart",
} as const satisfies Record<string, string>;

export type HubPressFeedId = keyof typeof HUB_PRESS_FEEDS;

export const HUB_PRESS_FEED_IDS = Object.keys(HUB_PRESS_FEEDS) as HubPressFeedId[];
