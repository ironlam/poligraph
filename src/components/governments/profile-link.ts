// Link from a ministerial mandate on a profile to its government page. Pure, no directive: called
// from the client `MandateTimeline` and from tests.

import { parisDay } from "@/lib/governments/dates";
import type { ProfileMandateGovernment } from "@/lib/data/politician-profile-reads";

export type MandateGovernmentLink = {
  name: string;
  href: string;
  /**
   * Individual end: the day before the end (on the end day the successor may already be listed),
   * never before the start. Collective resignation: the end day. No end: the start day.
   */
  compositionHref: string;
  compositionDay: string;
  /**
   * Collective resignation of a government whose current-affairs regime is attested by an act: the
   * function went on under current affairs (no end date claimed).
   */
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
  const collective = mandate.governmentData?.endKind === "COLLECTIVE_RESIGNATION";
  const compositionDay = compositionDayOf(mandate.startDate, mandate.endDate, collective);
  return {
    name: government.name,
    href,
    compositionHref: `${href}?date=${compositionDay}`,
    compositionDay,
    currentAffairs:
      collective && government.currentAffairsActId != null && government.resignedEvidence === "ACT",
  };
}

function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function compositionDayOf(
  start: Date | string,
  end: Date | string | null,
  collective: boolean
): string {
  const startDay = parisDay(new Date(start));
  if (end == null) return startDay;
  const endDay = parisDay(new Date(end));
  if (collective) return endDay;
  const before = previousDay(endDay);
  return before < startDay ? startDay : before;
}
