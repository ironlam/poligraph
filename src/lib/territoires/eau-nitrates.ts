import {
  EAU_MIN_ANALYSES,
  EAU_NITRATES_LIMIT_MG_L,
  EAU_WINDOW_MONTHS,
} from "@/config/territoire-reperes";

/**
 * Nitrates in tap water, by distribution unit (#1052, "Le territoire en chiffres", lot R4). Pure:
 * no network, no database. The importer streams the ministry files and feeds these rules.
 *
 * A figure is a count of analyses and a count above the quality limit, per distribution unit
 * (UDI). Never an average, never a mean across units: a commune served by several units shows
 * each one. Below the threshold of analyses, nothing is established.
 */

export type AnalysisVerdict = "AU_DESSUS" | "SOUS_LA_LIMITE" | "INDETERMINE";

const NUMBER = /^([<>]=?)?\s*(\d+(?:[.,]\d+)?)$/;

/** Limit from the source's own wording ("<=50 mg/L" gives 50), null when it cannot be read. */
export function parseLimit(limitequal: string): number | null {
  const m = /^<=\s*(\d+(?:[.,]\d+)?)\s*mg\/L$/i.exec(limitequal.trim());
  return m ? Number((m[1] as string).replace(",", ".")) : null;
}

/**
 * Reads the raw result text ("14", "3,2", "<1"), never the translated numeric column: a value
 * below the quantification limit is translated to a number that is not a measurement.
 * A result that cannot be placed against the limit is INDETERMINE, and is not counted.
 */
export function classifyAnalysis(rqana: string, limit: number): AnalysisVerdict {
  const m = NUMBER.exec(rqana.trim());
  if (!m) return "INDETERMINE";
  const op = m[1] ?? "";
  const v = Number((m[2] as string).replace(",", "."));
  if (op === "") return v > limit ? "AU_DESSUS" : "SOUS_LA_LIMITE";
  if (op.startsWith("<")) return v <= limit ? "SOUS_LA_LIMITE" : "INDETERMINE";
  // "> v": the value is above v; it is above the limit only if v is not below it.
  if (op === ">") return v >= limit ? "AU_DESSUS" : "INDETERMINE";
  return v > limit ? "AU_DESSUS" : "INDETERMINE";
}

/**
 * Which sampling lines count for a distribution unit. The producer reports every result to the
 * unit concerned, and leaves to each regional health agency the decision to extrapolate a sample
 * taken upstream to the unit: dropping lines on a rule of our own could hide an exceedance.
 *
 * - TOUS (default): every line, as the producer attributes it.
 * - SUR_UNITE: only samples taken on the unit itself (no upstream installation), a stricter
 *   reading that leaves many units under the threshold of analyses.
 */
export type SamplePolicy = "TOUS" | "SUR_UNITE";

export const DEFAULT_SAMPLE_POLICY: SamplePolicy = "TOUS";

export function sampleCounts(policy: SamplePolicy, line: { cdreseauamont: string }): boolean {
  return policy === "TOUS" || line.cdreseauamont.trim() === "";
}

export interface EauWindow {
  /** First day counted, ISO. */
  start: string;
  /** Last day counted: the most recent sampling date of the source, ISO. */
  end: string;
}

/**
 * Twelve months ending at the latest sampling date OF THE SOURCE, not at today's date: the file is
 * published with a delay, and counting back from today would show "not established" for units
 * that simply have no analysis yet in the missing weeks.
 */
export function eauWindow(latestSamplingDate: string, months = EAU_WINDOW_MONTHS): EauWindow {
  const [y, m, d] = latestSamplingDate.split("-").map(Number) as [number, number, number];
  // The same day `months` earlier, clamped to that month's length (29 February has no twin the
  // year before), then one day later: the window never skips nor repeats a day.
  const daysInTarget = new Date(Date.UTC(y, m - months, 0)).getUTCDate();
  const start = new Date(Date.UTC(y, m - 1 - months, Math.min(d, daysInTarget) + 1));
  return { start: start.toISOString().slice(0, 10), end: latestSamplingDate };
}

export function inWindow(date: string, w: EauWindow): boolean {
  return date >= w.start && date <= w.end;
}

export interface UdiCount {
  /** Analyses that could be placed against the limit. */
  analyses: number;
  above: number;
  /** Analyses that could not be placed: reported, never counted. */
  indeterminate: number;
}

export function addAnalysis(counts: Map<string, UdiCount>, udi: string, v: AnalysisVerdict) {
  const c = counts.get(udi) ?? { analyses: 0, above: 0, indeterminate: 0 };
  if (v === "INDETERMINE") c.indeterminate++;
  else {
    c.analyses++;
    if (v === "AU_DESSUS") c.above++;
  }
  counts.set(udi, c);
}

export interface CommuneUdiLink {
  commune: string;
  udi: string;
  udiLabel: string;
}

export interface EauRow {
  territoryCode: string;
  indicatorKey: "eau_nitrates";
  scopeId: string;
  scopeLabel: string;
  /** Analyses above the limit. Null when not established. */
  value: number | null;
  /** Analyses counted, even when below the threshold. */
  sampleSize: number;
  state: "ETABLI" | "NON_ETABLI";
  reason: "SEUIL_ANALYSES" | null;
}

/**
 * One row per commune and distribution unit. Under the threshold the row is NON_ETABLI with its
 * count kept: "3 analyses" is said, not turned into a figure. A unit with no analysis at all is
 * the same, with a count of zero analyses, never a zero above the limit.
 */
export function buildEauRows(
  links: readonly CommuneUdiLink[],
  counts: ReadonlyMap<string, UdiCount>,
  knownCommunes: ReadonlySet<string>,
  minAnalyses = EAU_MIN_ANALYSES
): EauRow[] {
  const seen = new Set<string>();
  const rows: EauRow[] = [];
  for (const l of links) {
    if (!knownCommunes.has(l.commune)) continue;
    const key = `${l.commune}|${l.udi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = counts.get(l.udi);
    const n = c?.analyses ?? 0;
    const established = n >= minAnalyses;
    rows.push({
      territoryCode: l.commune,
      indicatorKey: "eau_nitrates",
      scopeId: l.udi,
      scopeLabel: l.udiLabel,
      value: established ? (c?.above ?? 0) : null,
      sampleSize: n,
      state: established ? "ETABLI" : "NON_ETABLI",
      reason: established ? null : "SEUIL_ANALYSES",
    });
  }
  return rows.sort(
    (a, b) => a.territoryCode.localeCompare(b.territoryCode) || a.scopeId.localeCompare(b.scopeId)
  );
}

export { EAU_NITRATES_LIMIT_MG_L };
