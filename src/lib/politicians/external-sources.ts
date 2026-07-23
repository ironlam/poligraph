import type { DataSource } from "@prisma/client";
import { DATA_SOURCE_LABELS } from "@/config/labels";

export type ExternalIdInput = { source: DataSource; url: string | null };
export type SourceLink = { source: DataSource; label: string; url: string };

// Verification links shown in "Sources & vérifier", most trustworthy first.
const SOURCE_PRIORITY: DataSource[] = [
  "HATVP",
  "ASSEMBLEE_NATIONALE",
  "SENAT",
  "PARLEMENT_EUROPEEN",
  "WIKIDATA",
  "NOSDEPUTES",
  "OPENSANCTIONS",
  "WIKIPEDIA",
  "GOUVERNEMENT",
  "RNE",
];

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    let out = u.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

// Dedupe ONLY strictly identical (source, normalized URL) pairs. Distinct URLs
// for the same source (e.g. several legislatures) are all kept.
export function buildSourceLinks(externalIds: ExternalIdInput[]): SourceLink[] {
  const seen = new Set<string>();
  const links: SourceLink[] = [];
  for (const e of externalIds) {
    if (!e.url) continue;
    const key = `${e.source} ${normalizeUrl(e.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source: e.source, label: DATA_SOURCE_LABELS[e.source], url: e.url });
  }
  const rank = (s: DataSource) => {
    const i = SOURCE_PRIORITY.indexOf(s);
    return i === -1 ? SOURCE_PRIORITY.length : i;
  };
  return links.sort((a, b) => rank(a.source) - rank(b.source));
}
