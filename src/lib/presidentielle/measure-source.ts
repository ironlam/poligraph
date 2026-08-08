/**
 * Which source a surface cites for a measure, as a pure function.
 *
 * Pure and here rather than inline in the loader for the same reason as
 * `candidacy-rollup`: it is a one-line rule that reads as obviously correct, and the
 * obviously-correct version is the wrong one.
 *
 * Sources come back ordered by `publishedAt asc`, so `sources[0]` is the EARLIEST. On a
 * measure announced in an interview and later written into the programme, that picks the
 * interview and cites a secondary source next to a measure the programme carries.
 *
 * The fallback is not defensive padding either: `PUBLIC_MEASURE_WHERE` requires a source,
 * not a primary one, so a measure backed only by an article is publishable and must still
 * show where it comes from. Returning null there would hide a real source to enforce a
 * preference.
 */

export type CitableSource = { url: string; tier: string };

export function pickMeasureSourceUrl(sources: readonly CitableSource[]): string | null {
  return (sources.find((source) => source.tier === "PRIMARY") ?? sources[0])?.url ?? null;
}
