/**
 * Affair Status Tracking Service
 *
 * Automatically creates AffairEvent entries when a sync process
 * modifies an affair's status, providing an audit trail in the timeline.
 */

import { db } from "@/lib/db";
import type { AffairStatus, AffairEventType, SourceType } from "@/generated/prisma";

/** Map a new AffairStatus to the corresponding AffairEventType */
function statusToEventType(status: AffairStatus): AffairEventType {
  const map: Record<AffairStatus, AffairEventType> = {
    ENQUETE_PRELIMINAIRE: "ENQUETE_PRELIMINAIRE",
    INSTRUCTION: "INFORMATION_JUDICIAIRE",
    INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: "AUTRE",
    MISE_EN_EXAMEN: "MISE_EN_EXAMEN",
    RENVOI_TRIBUNAL: "RENVOI_TRIBUNAL",
    PROCES_EN_COURS: "PROCES",
    CONDAMNATION_PREMIERE_INSTANCE: "CONDAMNATION",
    APPEL_EN_COURS: "APPEL",
    POURVOI_EN_CASSATION: "POURVOI_CASSATION",
    CONDAMNATION_DEFINITIVE: "CONDAMNATION",
    RELAXE: "RELAXE",
    ACQUITTEMENT: "ACQUITTEMENT",
    NON_LIEU: "NON_LIEU",
    PRESCRIPTION: "PRESCRIPTION",
    CLASSEMENT_SANS_SUITE: "AUTRE",
  };
  return map[status] ?? "AUTRE";
}

/** Human-readable label for AffairStatus */
function statusLabel(status: AffairStatus): string {
  const labels: Record<AffairStatus, string> = {
    ENQUETE_PRELIMINAIRE: "Enquête préliminaire",
    INSTRUCTION: "Instruction",
    INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: "Instruction clôturée, sans mise en examen",
    MISE_EN_EXAMEN: "Mise en examen",
    RENVOI_TRIBUNAL: "Renvoi devant le tribunal",
    PROCES_EN_COURS: "Procès en cours",
    CONDAMNATION_PREMIERE_INSTANCE: "Condamnation (1ère instance)",
    APPEL_EN_COURS: "Appel en cours",
    POURVOI_EN_CASSATION: "Pourvoi en cassation",
    CONDAMNATION_DEFINITIVE: "Condamnation définitive",
    RELAXE: "Relaxe",
    ACQUITTEMENT: "Acquittement",
    NON_LIEU: "Non-lieu",
    PRESCRIPTION: "Prescription",
    CLASSEMENT_SANS_SUITE: "Classement sans suite",
  };
  return labels[status] ?? status;
}

/** Source type label */
function sourceTypeLabel(sourceType: SourceType): string {
  const labels: Record<SourceType, string> = {
    WIKIDATA: "Wikidata",
    JUDILIBRE: "Judilibre",
    LEGIFRANCE: "Légifrance",
    PRESSE: "Presse",
    WIKIPEDIA: "Wikipedia",
    MANUAL: "Manuel",
  };
  return labels[sourceType] ?? sourceType;
}

/**
 * Track a status change by creating an AffairEvent.
 *
 * Call this whenever a sync process upgrades an affair's status.
 */
export async function trackStatusChange(
  affairId: string,
  oldStatus: AffairStatus,
  newStatus: AffairStatus,
  source: { type: SourceType; url?: string; title?: string }
): Promise<void> {
  if (oldStatus === newStatus) return;

  const eventType = statusToEventType(newStatus);
  const title = `Statut mis à jour : ${statusLabel(oldStatus)} → ${statusLabel(newStatus)} (${sourceTypeLabel(source.type)})`;

  await db.affairEvent.create({
    data: {
      affairId,
      date: new Date(),
      type: eventType,
      title,
      sourceUrl: source.url,
      sourceTitle: source.title,
    },
  });
}
