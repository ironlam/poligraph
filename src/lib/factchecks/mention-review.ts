import { Prisma } from "@/generated/prisma";

/**
 * Which fact-check mentions count as a real link between a fact-check and a politician.
 *
 * The sync links a politician on their full name, or on their last name alone. A last name alone
 * is a weak signal: "Gérard" in "Gérard Curnier" was linked to Félicie Gérard, and one fact-check
 * naming "Leclerc" was linked to every published Leclerc. Such a mention stays visible in the admin
 * but feeds no indexation signal until an admin validates it (`reviewedAt`) or removes it (which
 * also blocks the pair for later syncs, see `recordMentionBlock`).
 *
 * A mention whose name holds a space was matched on a full name (or on a compound last name, which
 * is as discriminating), so it needs no review. A missing name gives no evidence either way: it
 * waits for review like a single word.
 *
 * Three forms of the same rule, kept equal by `mention-review.test.ts`: the predicate for code that
 * holds a row, the Prisma filter, and the SQL filter for raw queries (sitemap).
 */

export interface MentionReviewFields {
  matchedName: string | null;
  reviewedAt: Date | string | null;
}

/** True when the mention was matched on a single word (last name alone). */
export function isSingleWordMention(matchedName: string | null): boolean {
  return !(matchedName ?? "").trim().includes(" ");
}

/** True when the mention still waits for an admin decision before it counts. */
export function needsMentionReview(mention: MentionReviewFields): boolean {
  return mention.reviewedAt == null && isSingleWordMention(mention.matchedName);
}

/**
 * Prisma filter of the mentions that count. `contains: " "` is the negation of
 * `isSingleWordMention` for every stored name: the sync and the admin write names already trimmed,
 * from `Politician.fullName` / `lastName`.
 */
export const CONFIRMED_MENTION_WHERE = {
  OR: [{ reviewedAt: { not: null } }, { matchedName: { contains: " " } }],
} satisfies Prisma.FactCheckMentionWhereInput;

/** Prisma filter of the mentions waiting for review: the exact complement of the one above. */
export const MENTION_TO_REVIEW_WHERE = {
  reviewedAt: null,
  OR: [{ matchedName: null }, { NOT: { matchedName: { contains: " " } } }],
} satisfies Prisma.FactCheckMentionWhereInput;

/**
 * SQL form of CONFIRMED_MENTION_WHERE. Only fixed aliases are accepted, so no caller can
 * interpolate an arbitrary identifier.
 */
export function getConfirmedMentionSqlWhere(alias: "f" | "m" = "f"): Prisma.Sql {
  if (alias === "m") {
    return Prisma.sql`(m."reviewedAt" IS NOT NULL OR strpos(m."matchedName", ' ') > 0)`;
  }
  return Prisma.sql`(f."reviewedAt" IS NOT NULL OR strpos(f."matchedName", ' ') > 0)`;
}
