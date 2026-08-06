import type { SerializedMandate, SerializedAffairWithSources, AffairStatus } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * A mandate plus the relations the timeline needs to say who the person sat
 * with. `PoliticianFull.mandates` is typed as a bare `Mandate`, which is how
 * the group could be fetched by the page query and still never reach the
 * screen. Required (though nullable) on purpose: a missing `include` has to be
 * a compile error, not a silently empty line.
 */
export type TimelineMandate = SerializedMandate & {
  party: { name: string } | null;
  parliamentaryData: { parliamentaryGroup: { name: string } | null } | null;
  europeanData: { europeanGroup: { name: string } | null } | null;
};

export interface CareerTimelineProps {
  mandates: TimelineMandate[];
  partyHistory: {
    id: string;
    startDate: Date | null;
    endDate: Date | null;
    role: string;
    party: {
      name: string;
      shortName: string;
      slug: string | null;
      color: string | null;
    };
  }[];
  affairs: SerializedAffairWithSources[];
  birthDate?: Date | null;
  deathDate?: Date | null;
}

export interface TooltipData {
  x: number;
  y: number;
  content: React.ReactNode;
}

export interface TimelineAffair {
  id: string;
  title: string;
  date: Date;
  status: AffairStatus;
  category: string;
}

/** A chronological event for the mobile vertical timeline. */
export type MobileEvent =
  | { type: "mandate-start"; date: Date; mandate: TimelineMandate }
  | { type: "mandate-end"; date: Date; mandate: TimelineMandate }
  | {
      type: "party-change";
      date: Date;
      party: CareerTimelineProps["partyHistory"][number];
    }
  | { type: "affair"; date: Date; affair: TimelineAffair }
  | { type: "death"; date: Date };

// ─── Sizing constants ────────────────────────────────────────────────────

export const LEFT_MARGIN = 80;
export const RIGHT_MARGIN = 20;
export const ROW_HEIGHT = 40;
export const BAR_HEIGHT = 28;
export const MIN_BAR_WIDTH = 4;
export const MARKER_SIZE = 14;
export const PARTY_BAND_HEIGHT = 20;
export const YEAR_AXIS_HEIGHT = 28;
