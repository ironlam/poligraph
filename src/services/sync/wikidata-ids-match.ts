/**
 * Choose the Wikidata entity a politician's name search designates.
 *
 * Only an agreeing birth date links a politician. The previous rule accepted a
 * lone French candidate, or a lone politician, without looking at the date, and
 * treated a missing date as a match. Its 5-6 April 2026 run linked at least 103
 * small-town mayors to a historical namesake (a painter born in 1707, a bishop, a
 * general) and imported their death date and photo. A politician left unlinked
 * costs a later lookup; a wrong link puts someone else's life on the profile.
 */

export interface WikidataCandidate {
  id: string;
  label: string;
  isFrench: boolean;
  isPolitician: boolean;
  birthDate: Date | null;
}

/** Wikidata dates are midnight UTC, ours midnight Paris: allow a few days. */
const BIRTH_DATE_TOLERANCE_DAYS = 5;

function sameBirthDate(a: Date, b: Date): boolean {
  const days = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  return days <= BIRTH_DATE_TOLERANCE_DAYS;
}

export function findBestMatch(
  candidates: WikidataCandidate[],
  politicianBirthDate: Date | null
): WikidataCandidate | null {
  if (!politicianBirthDate) return null;
  const matches = candidates.filter(
    (c) => c.birthDate !== null && sameBirthDate(politicianBirthDate, c.birthDate)
  );
  return matches.length === 1 ? matches[0]! : null;
}
