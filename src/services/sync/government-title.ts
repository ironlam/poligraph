/**
 * The upstream data.gouv.fr CSV occasionally merges two rows into one
 * `fonction` value: the next person's name and title run straight into the
 * previous title with no separator, as in
 * "...par intérimAndré BettencourtMinistre délégué...".
 *
 * A lowercase letter immediately followed by an uppercase one never occurs in
 * a real French government title: "d'État" has an apostrophe in between,
 * "Outre-mer" a hyphen, and a new clause opens after a comma and a space. That
 * boundary is therefore a reliable marker of where the record actually ends.
 * Measured on the full 2111-row source: one match, the corrupted row.
 */
const GLUED_ENTRY = /\p{Ll}\p{Lu}/u;

export function sanitizeGovernmentTitle(raw: string): string {
  const match = GLUED_ENTRY.exec(raw);
  // The boundary sits between the two matched letters, so keep everything up
  // to and including the lowercase one.
  return (match ? raw.slice(0, match.index + 1) : raw).trim();
}
