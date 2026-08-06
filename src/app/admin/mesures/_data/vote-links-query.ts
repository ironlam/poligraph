import { db } from "@/lib/db";

/**
 * The vote links already attached to a measure, for the moderation surface.
 *
 * Admin-only, so it deliberately carries `rationale` and `reviewedBy`: unlike the public
 * `getPublicMeasureVoteRelation()`, this is the internal editorial view of what has been recorded and by
 * whom. It never derives a public state; it lists the raw rows so the reviewer can audit them.
 */
export async function getMeasureVoteLinksForModeration(measureId: string) {
  return db.measureVoteLink.findMany({
    where: { measureId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      scrutinId: true,
      linkKind: true,
      relation: true,
      isReference: true,
      applicableRevisionId: true,
      rationale: true,
      checkedAt: true,
      institutionScope: true,
      legislatureScope: true,
      searchMethod: true,
      reviewedBy: true,
      createdAt: true,
    },
  });
}

export type ModerationVoteLink = Awaited<
  ReturnType<typeof getMeasureVoteLinksForModeration>
>[number];
