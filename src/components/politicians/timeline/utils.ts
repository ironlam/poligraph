import type { SerializedMandate } from "@/types";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import type { TimelineMandate } from "./types";

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
