export interface DossierTimelineEntry {
  code: string; // "DEBATS-SEANCE", "COM-FOND-RAPPORT"
  label: string; // nomCanonique from AN open data
  date: string | null; // ISO date string
  chamber: string; // "AN" | "SENAT" | "CMP" | "CC" | "GOV"
  voteRefs?: string[]; // Exact official links to AN scrutins, used as a trusted anchor.
  children?: DossierTimelineEntry[];
}
