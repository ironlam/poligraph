import type { Chamber, MandateType } from "@/generated/prisma";

export const PARTICIPATION_METHOD_VERSION = "public-scrutins-v2";

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

export interface CurrentParliamentaryMandate {
  type: MandateType;
  startDate: Date;
  endDate: Date | null;
}

export interface CurrentMandateResolution {
  applicableMandate: CurrentParliamentaryMandate | null;
  status: Exclude<ParticipationStatus, "AVAILABLE">;
}

/**
 * Resolve the publication perimeter before considering the requested view.
 * A caller-provided mandate type cannot hide a second current parliamentary mandate.
 */
export function resolveCurrentParliamentaryMandate(
  mandates: CurrentParliamentaryMandate[],
  requestedMandateType?: MandateType
): CurrentMandateResolution {
  if (mandates.length !== 1) {
    return {
      applicableMandate: null,
      status: PARTICIPATION_COMPUTATION_INCOMPLETE,
    };
  }

  const mandate = mandates[0];
  const hasValidParliamentaryPerimeter =
    mandate !== undefined &&
    (mandate.type === "DEPUTE" || mandate.type === "SENATEUR") &&
    Number.isFinite(mandate.startDate.getTime());
  if (
    !hasValidParliamentaryPerimeter ||
    (requestedMandateType !== undefined && mandate.type !== requestedMandateType)
  ) {
    return {
      applicableMandate: null,
      status: PARTICIPATION_COMPUTATION_INCOMPLETE,
    };
  }

  return {
    applicableMandate: mandate,
    status: participationStatusFor(mandate.type === "DEPUTE" ? "AN" : "SENAT"),
  };
}

/** Public participation rates use an integer percentage in every producer. */
export function roundParticipationRate(expressed: number, eligibleScrutins: number): number {
  if (eligibleScrutins <= 0) {
    throw new RangeError("eligibleScrutins must be greater than zero");
  }
  return Math.round((expressed / eligibleScrutins) * 100);
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
