import type { MonitoringDateOrigin, MonitoringDueReason } from "@/generated/prisma";
import type { NeedsHumanReason } from "./needs-human";

export const NEEDS_HUMAN_LABELS: Record<NeedsHumanReason, string> = {
  SIGNAL: "Évolution détectée",
  GARDE_FOU: "Deux contrôles sans résultat",
  DATE_ATTENDUE: "Date attendue échue",
  CONTROLE_IMPOSSIBLE: "Contrôle en retard",
};

export const DUE_REASON_LABELS: Record<MonitoringDueReason, string> = {
  DELIBERE: "Délibéré",
  AUDIENCE: "Audience",
  DELAI_RECOURS: "Délai de recours",
  CADENCE: "Cadence",
  MANUEL: "Manuel",
};

const DATE_ORIGIN_PHRASES: Record<MonitoringDateOrigin, string> = {
  HUMAN: "date saisie à la main",
  AUTO_SOURCE: "date annoncée par une source",
  CADENCE: "date fixée par la cadence",
};

/** One plain line: why the review is due, and where its date comes from. */
export function dueLine(dueReason: MonitoringDueReason, dateOrigin: MonitoringDateOrigin): string {
  if (dueReason === "CADENCE" && dateOrigin === "CADENCE") return "Motif : cadence";
  return `Motif : ${DUE_REASON_LABELS[dueReason]} · ${DATE_ORIGIN_PHRASES[dateOrigin]}`;
}

/** Calendar day (Paris, stored at 00:00 UTC) as "YYYY-MM-DD". */
export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}
