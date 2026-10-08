/**
 * Whether a Wikidata P488 (chairperson) claim may become a current party leader
 * mandate.
 *
 * Wikidata often keeps a past chair without an end qualifier, and without a start
 * one. Taking the first as current and dating the second "now" made a politician
 * dead in 2020 the current leader of a party dissolved in 1997, and rewrote his
 * current party. A leadership we cannot date, of a dissolved party or by someone
 * who has died, is not recorded.
 */
export function isCurrentChair(input: {
  startDate: Date | null;
  partyDissolvedDate: Date | null;
  politicianDeathDate: Date | null;
}): boolean {
  if (!input.startDate) return false;
  if (input.partyDissolvedDate) return false;
  if (input.politicianDeathDate) return false;
  return true;
}
