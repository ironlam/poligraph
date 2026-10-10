// Link from a ministerial mandate on a profile to its government page. Pure, no directive: called
// from the client `MandateTimeline` and from tests.

import { parisDay } from "@/lib/governments/dates";
import type { ProfileMandateGovernment } from "@/lib/data/politician-profile-reads";

export type MandateGovernmentLink = {
  name: string;
  href: string;
  /** Composition on the last day of the function if known, else on its first day. */
  compositionHref: string;
  compositionDay: string;
  /** Collective resignation: the function went on under current affairs (no end date claimed). */
  currentAffairs: boolean;
};

/**
 * Null unless the section is enabled and the mandate belongs to a PUBLISHED government. Tolerates
 * a mandate read from a profile document stored before `governmentData` existed (key absent).
 */
export function mandateGovernmentLink(
  mandate: {
    startDate: Date | string;
    endDate: Date | string | null;
    governmentData?: ProfileMandateGovernment | null;
  },
  enabled: boolean
): MandateGovernmentLink | null {
  const government = mandate.governmentData?.government;
  if (!enabled || !government || government.publicationStatus !== "PUBLISHED") return null;
  const href = `/politiques/gouvernements/${government.slug}`;
  const compositionDay = parisDay(new Date(mandate.endDate ?? mandate.startDate));
  return {
    name: government.name,
    href,
    compositionHref: `${href}?date=${compositionDay}`,
    compositionDay,
    currentAffairs: mandate.governmentData?.endKind === "COLLECTIVE_RESIGNATION",
  };
}
