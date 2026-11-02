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
 * The same holds for a vote on an article. Its title names the bill and the
 * article number, not what the article does, and "(examen prioritaire)" is a
 * procedure note, not the measure (the article 40 of the 2027 finance bill was
 * described as "a measure to speed up the examination of the budget"). The text
 * of the articles is not ingested, so an article vote is not described at all.
 *
 * So an amendment vote is described only from amendment-level substance, or
 * not at all. Better an empty block than a confident wrong one. A vote on a
 * sous-amendement decides only its modification: the parent's text alone would
 * credit the vote with adopting or rejecting the parent, so it needs the
 * sous-amendement's own text.
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

/**
 * True when the vote targets one article of a bill. The type comes from
 * `classifyScrutinTitle`, which tests amendments first: "l'amendement à l'article
 * X" is never an article vote.
 */
export function isArticleVote(scrutin: { type: ScrutinType | null; title: string }): boolean {
  return scrutin.type === "ARTICLE" && !isAmendmentVote(scrutin);
}

/** Substance read from the voted amendment itself, not from the whole bill. */
export function isAmendmentLevelSubstance(depth: SubstanceDepth | null): boolean {
  return depth === "amendment" || depth === "subAmendment";
}

/** True when the title puts a sous-amendement to the vote. */
export function isSubAmendmentVote(title: string): boolean {
  return parseScrutinTitle(title).subAmendmentNumber !== null;
}

/**
 * Whether an AI pipeline may describe the measure voted in this scrutin.
 * Whole-text and motion votes are not concerned. An article vote is refused: the
 * text of the articles is not ingested, so nothing grounds a description.
 */
export function canDescribeVotedMeasure(input: {
  type: ScrutinType | null;
  title: string;
  substanceDepth: SubstanceDepth | null;
}): boolean {
  if (isArticleVote(input)) return false;
  if (!isAmendmentVote(input)) return true;
  if (isSubAmendmentVote(input.title)) return input.substanceDepth === "subAmendment";
  return isAmendmentLevelSubstance(input.substanceDepth);
}

/**
 * Prisma fragment excluding the votes no pipeline may describe: ARTICLE votes
 * (no article text) and AMENDEMENT votes that no amendment is linked to yet.
 * Applied in the generators' candidate query so these rows are not selected,
 * retried and billed every day; an amendment vote becomes a candidate the run
 * after its link is written.
 */
export const AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE: Prisma.ScrutinWhereInput = {
  OR: [
    { type: null },
    { type: { notIn: ["AMENDEMENT", "ARTICLE"] } },
    { amendmentLinks: { some: {} } },
  ],
};
