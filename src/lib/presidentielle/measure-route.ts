const PRESIDENTIAL_MEASURE_PREFIX = "/elections/presidentielle-2027/mesures/";
const LEGACY_CUID_PATTERN = /^c[a-z0-9]{20,31}$/;

export function getLegacyMeasureId(pathname: string): string | null {
  if (!pathname.startsWith(PRESIDENTIAL_MEASURE_PREFIX)) return null;
  const segment = pathname.slice(PRESIDENTIAL_MEASURE_PREFIX.length);
  return LEGACY_CUID_PATTERN.test(segment) ? segment : null;
}

export function getPresidentialMeasurePath(slug: string): string {
  return `${PRESIDENTIAL_MEASURE_PREFIX}${slug}`;
}
