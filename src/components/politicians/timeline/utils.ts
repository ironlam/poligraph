import type { SerializedMandate } from "@/types";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import type { CareerTimelineProps, TimelineMandate } from "./types";

/**
 * Who the person sat with during a mandate, or what they were actually in
 * charge of. "Député" alone says nothing about the group; "Dirigeant(e) de
 * parti" says nothing about the party.
 *
 * Returns null whenever the data is missing, so the timeline silently falls
 * back to the generic label rather than filling the gap with a guess.
 */
export function mandateAffiliation(mandate: TimelineMandate): string | null {
  switch (mandate.type) {
    case "PRESIDENT_PARTI":
      return mandate.party?.name ?? null;

    case "DEPUTE":
    case "SENATEUR": {
      const group = mandate.parliamentaryData?.parliamentaryGroup?.name;
      return group ? `Groupe ${group}` : null;
    }

    case "DEPUTE_EUROPEEN": {
      const group = mandate.europeanData?.europeanGroup?.name;
      return group ? `Groupe ${group}` : null;
    }

    // Government titles carry the portfolio, which the mandate type does not.
    // Restricted to these types on purpose: elsewhere the title only repeats
    // the constituency already on screen ("Maire d'Agen").
    case "PREMIER_MINISTRE":
    case "MINISTRE":
    case "MINISTRE_DELEGUE":
    case "SECRETAIRE_ETAT": {
      const title = mandate.title?.trim();
      if (!title) return null;
      return title.toLowerCase() === MANDATE_TYPE_LABELS[mandate.type].toLowerCase() ? null : title;
    }

    default:
      return null;
  }
}

type PartyStint = CareerTimelineProps["partyHistory"][number];

/**
 * Longest break between two memberships of the same party still read as one stint.
 *
 * The party syncs hand `currentPartyId` back and forth, and each hand-off closes the
 * membership and opens a new one dated the day of the run. Measured on 2026-09-28: 890 breaks
 * under 90 days, every one written by a sync since February 2026. Breaks beyond that are real
 * departures and stay visible.
 */
export const PARTY_STINT_MAX_GAP_DAYS = 90;

/**
 * Collapse consecutive memberships of the same party into one stint, so the timeline says
 * "Rejoint PS" once instead of once per sync run. The role is ignored: the timeline does not
 * show it. Undated memberships cannot be placed and are kept as they are.
 */
export function mergePartyStints(history: PartyStint[]): PartyStint[] {
  const maxGapMs = PARTY_STINT_MAX_GAP_DAYS * 86_400_000;
  const partyKey = (s: PartyStint) => s.party.slug ?? s.party.name;
  const time = (d: Date | null) => (d ? new Date(d).getTime() : Infinity);

  const dated = history
    .filter((s) => s.startDate)
    .sort((a, b) => time(a.startDate) - time(b.startDate));

  const openByParty = new Map<string, PartyStint>();
  const merged: PartyStint[] = [];
  for (const stint of dated) {
    const previous = openByParty.get(partyKey(stint));
    if (previous && time(stint.startDate) - time(previous.endDate) <= maxGapMs) {
      if (time(stint.endDate) > time(previous.endDate)) previous.endDate = stint.endDate;
      continue;
    }
    const copy = { ...stint };
    merged.push(copy);
    openByParty.set(partyKey(stint), copy);
  }

  return [...merged, ...history.filter((s) => !s.startDate)];
}

export function computeDuration(startDate: string | Date, endDate: string | Date | null): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const totalMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} mois`;
  if (months === 0) return `${years} an${years > 1 ? "s" : ""}`;
  return `${years} an${years > 1 ? "s" : ""} et ${months} mois`;
}

/**
 * Detect overlapping mandates within a row and assign a sub-row offset index.
 * Returns a Map from mandate.id to offset (0 = first lane, 1 = second, etc.).
 */
export function computeOverlapOffsets(mandates: SerializedMandate[]): Map<string, number> {
  const sorted = [...mandates].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  // Each lane tracks its current end date
  const lanes: Date[] = [];
  const offsets = new Map<string, number>();

  for (const m of sorted) {
    const start = new Date(m.startDate);
    // Find first lane where our start >= lane end
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (start >= lanes[i]!) {
        lanes[i] = m.endDate ? new Date(m.endDate) : new Date();
        offsets.set(m.id, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      offsets.set(m.id, lanes.length);
      lanes.push(m.endDate ? new Date(m.endDate) : new Date());
    }
  }
  return offsets;
}
