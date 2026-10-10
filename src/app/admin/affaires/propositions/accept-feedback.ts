import { AFFAIR_STATUS_LABELS } from "@/config/labels";
import { eventPrefillHref, type EventPrefill } from "@/lib/affairs/events/prefill";
import type { AffairStatus } from "@/generated/prisma";

export interface AcceptResponse {
  affairId: string;
  statusChange: { from: AffairStatus; to: AffairStatus; prefill: EventPrefill } | null;
  event: { id: string; status: "DRAFT" | "PUBLISHED"; reasons: string[] } | null;
}

export interface Feedback {
  kind: "error" | "success" | "warning";
  message: string;
  reasons?: string[];
  link?: { href: string; label: string };
}

/** Message après acceptation : un statut appliqué ne crée pas d'étape, une révélation peut rester en brouillon. */
export function acceptFeedback(payload: AcceptResponse): Feedback {
  if (payload.event) {
    const href = `/admin/affaires/${payload.affairId}#etapes`;
    return payload.event.status === "PUBLISHED"
      ? {
          kind: "success",
          message: "Proposition appliquée. La révélation est publiée dans la chronologie.",
          link: { href, label: "Voir la fiche" },
        }
      : {
          kind: "warning",
          message:
            "Proposition appliquée, mais la révélation reste en brouillon : le garde de publication l'a refusée.",
          reasons: payload.event.reasons,
          link: { href, label: "Corriger l'étape sur la fiche" },
        };
  }
  if (payload.statusChange) {
    const { from, to, prefill } = payload.statusChange;
    return {
      kind: "success",
      message: `Statut passé de « ${AFFAIR_STATUS_LABELS[from]} » à « ${AFFAIR_STATUS_LABELS[to]} ». Ce changement n'ajoute pas d'étape à la chronologie : ajoutez-la avec la date de l'acte donnée par la source.`,
      link: {
        href: eventPrefillHref(payload.affairId, prefill),
        label: "Ajouter l'étape correspondante",
      },
    };
  }
  return { kind: "success", message: "Proposition appliquée." };
}
