/**
 * Whether a generated axis says WHOSE programme it describes, instead of describing the country.
 *
 * The defect this catches has one grammatical signature: the theme takes the subject position.
 * "La transition écologique s'appuie sur la création d'un pôle public de l'énergie" is a present
 * indicative with nothing to attribute it, so it reads as a statement about France rather than
 * about what a candidacy proposes. It shipped that way, and it is what a reader saw on the fiche
 * until the heading was made to carry the distinction on its own.
 *
 * The subject is therefore required to come from a closed set, after an optional leading
 * complement ("Sur l'énergie, les mesures associent..."). Both prompts prescribe the same
 * openings, which is the half a screen cannot do on its own: a rule the model never reads is a
 * rule it never follows, and a rule nothing checks is a preference.
 *
 * The set holds six subjects rather than the two that would suffice, because four axes all
 * opening on "Le programme" read as a form. Each one attributes: it is the commitments doing the
 * acting, not the country.
 *
 * Shared by the fiche synthesis and the per-theme synthesis so the two cannot drift apart: they
 * describe the same object for the same reader, and a rule enforced on one of them only would be
 * a rule about which pipeline ran.
 *
 * The optional complement must itself open with a preposition. Allowing any short run of
 * characters before the comma was a hole: "L'eau devient gratuite, le programme le prévoit"
 * would have passed on the strength of its second clause while its first one asserted exactly
 * what this rejects. The complement is therefore a preposition plus at most five words, the
 * length of "Sur l'accès aux soins de proximité," and well short of a clause.
 *
 * TWO holes remain, and neither is closed by making the pattern longer:
 *
 * - A finite clause SHORT enough still fits: "Dans l'accès progresse, le programme le prévoit"
 *   passes. Telling a noun phrase from a clause needs French conjugation, not a regex, and a
 *   longer pattern here would look like protection without being any.
 * - This checks the OPENING, not the whole sentence. "Le programme prévoit X, et la transition
 *   écologique s'appuie sur Y" passes. The leading attribution governs the sentence grammatically
 *   and both prompts ask for a single sentence per axis.
 *
 * So this is a cheap structural guard against the drift a model actually produces, which is the
 * theme in subject position, and it must not be described as a semantic proof. What stands behind
 * it is the grounding pass, the three generation attempts, and a human reading the text before it
 * is published.
 */
const COMPLEMENT = /(?:sur|en|pour|dans|face à|au sujet de|côté)\b(?:\s+[^\s,]+){0,5}\s*,\s*/;
const SUBJECT =
  /(?:le programme|les mesures|les engagements|les propositions|la candidature|le projet)\b/;
const ATTRIBUTED_OPENING = new RegExp(`^(?:${COMPLEMENT.source})?${SUBJECT.source}`, "iu");

export function isAttributedClaim(value: string): boolean {
  return ATTRIBUTED_OPENING.test(value.trim());
}

/** One wording for both screens, so the moderator reads the same reason whichever one fired. */
export const UNATTRIBUTED_CLAIM_DETAIL =
  "un axe décrit l'état du pays au lieu de ce que la candidature propose";
