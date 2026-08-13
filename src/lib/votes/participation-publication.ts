import type { Chamber } from "@/generated/prisma";

export const PARTICIPATION_SOURCE_INSUFFICIENT = "SOURCE_INSUFFICIENT" as const;
export const PARTICIPATION_AVAILABLE = "AVAILABLE" as const;
export const PARTICIPATION_COMPUTATION_INCOMPLETE = "COMPUTATION_INCOMPLETE" as const;

export type ParticipationStatus =
  | typeof PARTICIPATION_AVAILABLE
  | typeof PARTICIPATION_SOURCE_INSUFFICIENT
  | typeof PARTICIPATION_COMPUTATION_INCOMPLETE;

export interface ParticipationPublicationContext {
  chamber?: Chamber | null;
  hasApplicableMandate: boolean;
  eligibleScrutins?: number | null;
  methodSupported: boolean;
}

/**
 * Participation is publishable only where the source supports an individual denominator.
 * Senate vote rows do not distinguish presence from several institutional non-participation cases.
 */
export function isParticipationPublishable(
  context: ParticipationPublicationContext | undefined
): boolean {
  return context !== undefined && resolveParticipationStatus(context) === PARTICIPATION_AVAILABLE;
}

export function participationStatusFor(
  chamber: Chamber | null | undefined
): Exclude<ParticipationStatus, "AVAILABLE"> {
  return chamber === "SENAT"
    ? PARTICIPATION_SOURCE_INSUFFICIENT
    : PARTICIPATION_COMPUTATION_INCOMPLETE;
}

/**
 * A numeric rate is public only when every required part of the AN computation is resolved.
 * This is the single publication policy shared by individual and aggregate DTOs.
 */
export function resolveParticipationStatus({
  chamber,
  hasApplicableMandate,
  eligibleScrutins,
  methodSupported,
}: ParticipationPublicationContext): ParticipationStatus {
  if (chamber === "SENAT") return PARTICIPATION_SOURCE_INSUFFICIENT;
  if (
    chamber !== "AN" ||
    !hasApplicableMandate ||
    !methodSupported ||
    eligibleScrutins == null ||
    eligibleScrutins <= 0
  ) {
    return PARTICIPATION_COMPUTATION_INCOMPLETE;
  }
  return PARTICIPATION_AVAILABLE;
}
