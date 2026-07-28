// The `scrutin.legislature` column mixes two unrelated numbering schemes:
// - Assemblée nationale legislature numbers (15, 16, 17...)
// - Sénat session-year buckets (2017, 2020, 2023...), stored as the bucket's start year
// A raw numeric value like 2023 must never be rendered with the AN ordinal
// suffix (the "2023e" bug): it needs the Sénat label instead.

// Sénat buckets are years, always >= 2000. AN legislature numbers are small integers.
const SENAT_BUCKET_THRESHOLD = 2000;

const AN_LEGISLATURE_YEARS: Record<number, { start: number; end?: number }> = {
  15: { start: 2017, end: 2022 },
  16: { start: 2022, end: 2024 },
  17: { start: 2024 },
};

const SENAT_BUCKET_YEARS: Record<number, { end?: number }> = {
  2017: { end: 2020 },
  2020: { end: 2023 },
  2023: {},
};

function formatAnLegislature(value: number): string {
  const years = AN_LEGISLATURE_YEARS[value];
  if (!years) {
    return `${value}ᵉ législature`;
  }
  const range = years.end === undefined ? `depuis ${years.start}` : `${years.start}-${years.end}`;
  return `${value}ᵉ législature (${range})`;
}

function formatSenatBucket(value: number): string {
  const bucket = SENAT_BUCKET_YEARS[value];
  const range = bucket?.end === undefined ? `depuis ${value}` : `${value}-${bucket.end}`;
  return `Sénat, ${range}`;
}

/**
 * Formats a raw `scrutin.legislature` value into a human-readable French label.
 * Values >= 2000 are Sénat session-year buckets; smaller values are AN legislature numbers.
 */
export function formatLegislature(value: number): string {
  if (value >= SENAT_BUCKET_THRESHOLD) {
    return formatSenatBucket(value);
  }
  return formatAnLegislature(value);
}
