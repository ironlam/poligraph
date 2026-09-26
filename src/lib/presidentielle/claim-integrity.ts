/**
 * Whether a generated axis was cut off before it finished.
 *
 * Observed on a real run, on the François Ruffin fiche: the provider response stopped inside an
 * evidence marker, so the axis ended on "...les activités des anciens ministres (" and every
 * screen accepted it. The orphan bracket is not even the provider's: `stripEvidenceMarkers`
 * removed the trailing "M12" and left the parenthesis behind, which is why looking for a stray
 * "M" would have missed it.
 *
 * Two signs, both structural and both cheap:
 *
 * - no sentence-final punctuation, which the career paragraph has always been checked for and
 *   an axis never was;
 * - unbalanced brackets, counted rather than matched, so a stray closing bracket is caught too.
 *
 * This says nothing about whether the sentence is complete in meaning. A provider can stop on a
 * full stop mid-argument and no counter will know. It catches the mechanical truncation, which
 * is the one that reaches a reader as visible garbage.
 */
export const TRUNCATED_CLAIM_DETAIL = "un axe est tronqué ou referme mal une parenthèse";

export function isTruncatedClaim(value: string): boolean {
  const text = value.trim();
  if (text === "") return true;
  if (!/[.!?]$/u.test(text)) return true;
  return hasUnbalancedBrackets(text);
}

function hasUnbalancedBrackets(text: string): boolean {
  let round = 0;
  let square = 0;
  for (const character of text) {
    if (character === "(") round += 1;
    else if (character === ")") round -= 1;
    else if (character === "[") square += 1;
    else if (character === "]") square -= 1;
    // A closing bracket before its opening one is as broken as one that never closes.
    if (round < 0 || square < 0) return true;
  }
  return round !== 0 || square !== 0;
}
