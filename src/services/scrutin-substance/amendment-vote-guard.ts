/**
 * Grounding rule for every AI text that describes a vote on an amendment
 * (scrutin summary, citizen impact).
 *
 * The title of an amendment vote ("l'amendement n° 1358 de M. X après
 * l'article 15") says nothing about what the amendment does. Without the
 * amendment's own text, a model fills the gap from the bill's general subject
 * and invents a measure (scrutin V9336: a digital-data tax described as energy
 * renovation aid for households). The dossier's exposé des motifs does not fill
 * that gap either: it describes the whole bill, not this amendment.
 *
 * So an amendment vote is described only from amendment-level substance, or
 * not at all. Better an empty block than a confident wrong one.
 */
import type { Prisma, ScrutinType } from "@/generated/prisma";
import { parseScrutinTitle } from "@/services/sync/link-scrutins-to-amendments/parse-title";
import type { SubstanceDepth } from "@/services/scrutin-policy-title/types";

/**
 * True when the vote targets an amendment or a sous-amendement. Reads the
 * classified type and, independently, the title: a scrutin whose type is not
 * (yet) AMENDEMENT but whose title cites an amendment number is still an
 * amendment vote, and the guard must fail closed on it.
 */
export function isAmendmentVote(scrutin: { type: ScrutinType | null; title: string }): boolean {
  if (scrutin.type === "AMENDEMENT") return true;
  const parsed = parseScrutinTitle(scrutin.title);
  return (
    parsed.subAmendmentNumber !== null ||
    parsed.principalNumbers.length > 0 ||
    parsed.identiqueNumbers.length > 0
  );
}

/** Substance read from the voted amendment itself, not from the whole bill. */
export function isAmendmentLevelSubstance(depth: SubstanceDepth | null): boolean {
  return depth === "amendment" || depth === "subAmendment";
}

/**
 * Whether an AI pipeline may describe the measure voted in this scrutin.
 * Non-amendment votes (whole text, article, motion) are not concerned.
 */
export function canDescribeVotedMeasure(input: {
  type: ScrutinType | null;
  title: string;
  substanceDepth: SubstanceDepth | null;
}): boolean {
  if (!isAmendmentVote(input)) return true;
  return isAmendmentLevelSubstance(input.substanceDepth);
}

/**
 * Prisma fragment excluding AMENDEMENT votes that no amendment is linked to
 * yet. Applied in the generators' candidate query so these rows are not
 * selected, retried and billed every day while the linker has not resolved
 * them; they become candidates the run after their link is written.
 */
export const AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE: Prisma.ScrutinWhereInput = {
  OR: [{ type: null }, { type: { not: "AMENDEMENT" } }, { amendmentLinks: { some: {} } }],
};
