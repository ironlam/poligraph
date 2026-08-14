/**
 * The colour code that identifies a candidacy on the public presidential surfaces.
 *
 * The subject pages carried a colour slot from the start, fed only by `CandidacyPresidential.accentColor`.
 * That field is set by hand in the admin and is null on every candidacy seeded so far, so every row
 * rendered the same neutral grey: a colour code that codes nothing, and a reader coming from the hub
 * (where the party mark is coloured) lost the key between two pages showing the same people.
 *
 * The resolution is a chain of decreasing certainty, and it stops rather than guessing:
 *
 * 1. The editorial accent, when an editor set one. An explicit decision beats anything derived.
 * 2. The colour of the party the candidacy is FILED under (`Candidacy.partyId`, an id, not a name).
 * 3. The colour of the party the linked politician currently belongs to, and only when the candidacy's
 *    own `partyLabel` names that same party.
 *
 * Step 3 is guarded for the same reason `getAffairPartyDisplay()` refuses the
 * `partyAtTime || currentParty` fallback: a candidacy is not always filed under the banner its author
 * currently sits with, and painting a candidacy in the colours of a party it is not running for is a
 * factual error about a real person, made worse by being non-partisan in intent and partisan in effect.
 * When the label disagrees, or when there is no label to check against, the slot stays neutral. A grey
 * bar says "we have no colour for this candidacy", which is true; the wrong colour says something false.
 *
 * Returning null is therefore a normal outcome, not a failure, and every caller must render a neutral
 * slot for it. The party name is written next to the mark on every surface, so the colour is never the
 * only carrier of the information (WCAG 1.4.1).
 */

export type CandidateAccentInput = {
  /** Editorial accent of the presidential extension, when an editor set one. */
  accentColor: string | null;
  /** The party the candidacy is filed under, linked by id. */
  candidacyParty: { color: string | null } | null;
  /** The party as the source of the candidacy writes it, free text. */
  partyLabel: string | null;
  /** The party the linked politician currently belongs to. */
  currentParty: { color: string | null; name: string; shortName: string } | null;
};

/** Lowercase, accents dropped, punctuation collapsed: "Les Écologistes" and "les ecologistes" match. */
function normalizePartyName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveCandidateAccentColor(input: CandidateAccentInput): string | null {
  if (input.accentColor !== null) return input.accentColor;
  if (input.candidacyParty?.color != null) return input.candidacyParty.color;

  const current = input.currentParty;
  if (current?.color == null) return null;
  if (input.partyLabel === null) return null;

  const label = normalizePartyName(input.partyLabel);
  if (label === "") return null;

  return label === normalizePartyName(current.name) ||
    label === normalizePartyName(current.shortName)
    ? current.color
    : null;
}
