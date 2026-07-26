/**
 * What a duplicate match rests on, told apart by category (#557).
 *
 * Lives here rather than next to the matcher because the matcher imports the Prisma
 * client, and this is a pure classification consumed by a pure decision function.
 * Shared vocabulary belongs below both.
 *
 * The distinction it draws is the whole point:
 *
 *   a shared court decision  →  same decision, possibly several affairs
 *   shared editorial content →  possibly one affair described twice
 *
 * Only the second is a reason to merge. Two Carignon convictions share a pourvoi
 * number, a facts date, a verdict date and one cassation ruling, and are still two
 * counts — subornation of a witness and misuse of company assets — so two affairs.
 */

/**
 * Signals that identify a shared court decision or proceeding: official numbers
 * assigned by a court, not words a title happens to share.
 *
 * A shared identifier says "same decision or same proceeding". It does NOT say
 * "same editorial affair", and on its own it may never authorise a merge.
 */
export const OFFICIAL_JUDICIAL_IDENTIFIER_SIGNALS: ReadonlySet<string> = new Set([
  "ecli",
  "pourvoiNumber",
  "caseNumbers",
  // Not produced by the matcher yet. Declared so that the day a shared
  // `CourtDecision` becomes a signal, it is classified as a decision identity by
  // construction rather than by someone remembering to add it here.
  "courtDecision",
  "judilibreId",
]);

/**
 * Signals that rest on the affair's own editorial content: what a human wrote in
 * the title, the category, the dates.
 *
 * These are the only signals that may authorise an automatic merge. They can be
 * wrong, but when they are, they are wrong about *the same affair being described
 * twice*, which is what a merge fixes. A shared decision identifier is not wrong at
 * all, and still does not mean one affair.
 */
export const EDITORIAL_IDENTITY_SIGNALS: ReadonlySet<string> = new Set([
  "title",
  "title-exact",
  "title-exact-date-conflict",
  "title-partial",
  "category",
  "date",
  // From the draft-clustering pass in `reconciliation.ts`, which pairs on
  // `politician+category+window`. These rest on the affairs' own attributes, not on
  // a court identifier, so they belong here. That pass only ever reaches POSSIBLE,
  // so the confidence gate stops it anyway; the classification still has to be right.
  "politician",
  "window",
]);

export interface MatchEvidence {
  /** At least one atom names a court-assigned identifier or a shared decision. */
  officialDecisionIdentity: boolean;
  /** At least one atom rests on the affair's own editorial content. */
  editorialIdentityEvidence: boolean;
  /** Atoms in neither vocabulary. Counted as evidence of nothing, deliberately. */
  unrecognisedSignals: string[];
}

/**
 * Classifies a `matchedBy` value.
 *
 * `matchedBy` is a `string`, and `title+category` shows the format already composes
 * with `+`. A plain equality test against a set of names would therefore go quietly
 * false the day a composite like `ecli+title-exact` appears — which is exactly the
 * bug that would let a shared decision authorise a merge again. So the value is
 * decomposed and each atom classified.
 */
export function classifyMatchEvidence(matchedBy: string): MatchEvidence {
  const atoms = matchedBy
    .split("+")
    .map((atom) => atom.trim())
    .filter(Boolean);

  return {
    officialDecisionIdentity: atoms.some((atom) => OFFICIAL_JUDICIAL_IDENTIFIER_SIGNALS.has(atom)),
    // An unknown atom must not pass for editorial evidence: a signal nobody has
    // classified is not a reason to delete a row automatically.
    editorialIdentityEvidence: atoms.some((atom) => EDITORIAL_IDENTITY_SIGNALS.has(atom)),
    unrecognisedSignals: atoms.filter(
      (atom) =>
        !OFFICIAL_JUDICIAL_IDENTIFIER_SIGNALS.has(atom) && !EDITORIAL_IDENTITY_SIGNALS.has(atom)
    ),
  };
}

/**
 * Whether a match rests on a court-assigned identifier rather than resemblance.
 *
 * Useful to tell a reviewer why a pair is worth reading — the two fiches cite the
 * same decision — never to conclude that they are duplicates.
 */
export function isOfficialJudicialIdentifierMatch(matchedBy: string): boolean {
  return classifyMatchEvidence(matchedBy).officialDecisionIdentity;
}
