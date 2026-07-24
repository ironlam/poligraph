import { SITE_URL } from "@/config/site";

export const citeAnchorId = {
  affair: (affairId: string) => `affair-${affairId}`,
  declaration: (declarationId: string) => `declaration-${declarationId}`,
};

/**
 * Client-only. Builds a canonical permalink to an in-page anchor, keeping only
 * the `tab` query param (drops utm_*, fbclid, etc.) so the cited link stays clean.
 */
export function buildAnchorUrl(anchorId: string): string {
  const { pathname } = window.location;
  const tab = new URLSearchParams(window.location.search).get("tab");
  const query = tab ? `?tab=${tab}` : "";
  return `${SITE_URL}${pathname}${query}#${anchorId}`;
}

/** Absolute permalink to a scrutin detail page (used for recent-vote rows). */
export const scrutinPermalink = (scrutinId: string) => `${SITE_URL}/parlement/votes/${scrutinId}`;
