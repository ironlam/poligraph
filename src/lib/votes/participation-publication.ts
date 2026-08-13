import type { Chamber } from "@/generated/prisma";

export const PARTICIPATION_SOURCE_INSUFFICIENT = "SOURCE_INSUFFICIENT" as const;
export const PARTICIPATION_AVAILABLE = "AVAILABLE" as const;

export type ParticipationStatus =
  | typeof PARTICIPATION_AVAILABLE
  | typeof PARTICIPATION_SOURCE_INSUFFICIENT;

/**
 * Participation is publishable only where the source supports an individual denominator.
 * Senate vote rows do not distinguish presence from several institutional non-participation cases.
 */
export function isParticipationPublishable(chamber: Chamber | undefined): boolean {
  return chamber !== "SENAT";
}

export function participationStatusFor(chamber: Chamber | undefined): ParticipationStatus {
  return isParticipationPublishable(chamber)
    ? PARTICIPATION_AVAILABLE
    : PARTICIPATION_SOURCE_INSUFFICIENT;
}
