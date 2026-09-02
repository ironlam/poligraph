"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MeasureActionForm } from "./MeasureActionForms";
import type { AvailableAction } from "../_data/available-actions";
import {
  generateContextDraftAction,
  publishRevisionAction,
  reviewRevisionAction,
  type ActionResult,
} from "../actions";
import { BUTTON, DANGER } from "./measure-action-styles";

/**
 * The editorial actions of one measure.
 *
 * Three rules shape this panel, and each answers a way the interface could mislead:
 *
 * 1. **Only applicable actions.** The set comes from `availableActions()`, so nothing is offered
 *    that the transition would refuse.
 * 2. **One form open at a time.** Seven open forms on a phone is unreadable, and it invites acting
 *    on the wrong one.
 * 3. **Every dangerous action names its revision.** Publishing, discarding and depublishing act on
 *    a specific text, and the reviewer has to see which one before confirming.
 *
 * The version token comes from the read that rendered the page and travels with every write. After
 * a success the whole route is refreshed rather than patched, so no other form is left holding a
 * token that has just gone stale.
 */

export function MeasureActionPanel({
  measureId,
  expectedUpdatedAt,
  actions,
  revisionTexts,
  revisionDetails,
  canGenerateContext,
  isWithdrawn,
  pointersAmbiguous,
}: {
  measureId: string;
  expectedUpdatedAt: string;
  actions: AvailableAction[];
  revisionTexts: Record<string, string>;
  revisionDetails: Record<string, string | null>;
  canGenerateContext: boolean;
  isWithdrawn: boolean;
  pointersAmbiguous: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null);

  function run(action: () => Promise<ActionResult>): void {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(null);
        // Full refresh, not a local patch: every other form on this page carries the version token
        // of the previous render, and acting on a stale one would be refused anyway.
        router.refresh();
        return;
      }
      setFailure({ message: result.message, stale: result.stale === true });
    });
  }

  if (pointersAmbiguous) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
        <p className="font-medium text-red-800 dark:text-red-300">
          Aucune action proposée sur cette mesure.
        </p>
        <p className="mt-1 text-red-700 dark:text-red-400">
          Ses pointeurs de révision se contredisent, donc il n&apos;y a pas de réponse sûre à « sur
          quelle révision cette action agirait ». Corriger les anomalies ci-dessus d&apos;abord.
        </p>
      </div>
    );
  }

  if (actions.length === 0 && !canGenerateContext) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune action éditoriale disponible dans cet état.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {isWithdrawn && (
        <p className="rounded border border-border bg-muted/40 p-3 text-sm">
          Cette mesure est <strong>retirée</strong>. Publier une correction met à jour le texte
          affiché et ne réactive pas la proposition : l&apos;état de retrait et sa source restent
          inchangés.
        </p>
      )}

      {failure !== null && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="font-medium text-red-800 dark:text-red-300">
            {failure.stale ? "La fiche a changé" : "Action refusée"}
          </p>
          <p className="mt-1 text-red-700 dark:text-red-400">{failure.message}</p>
          {failure.stale && (
            <button type="button" className={`${BUTTON} mt-2`} onClick={() => router.refresh()}>
              Recharger la fiche
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canGenerateContext && (
          <button
            type="button"
            className={BUTTON}
            disabled={pending}
            onClick={() => run(() => generateContextDraftAction({ measureId, expectedUpdatedAt }))}
          >
            {pending ? "Génération en cours…" : "Générer un brouillon de contexte"}
          </button>
        )}
        {actions.map((action) => {
          if (action.kind === "review") {
            return (
              <button
                key="review"
                type="button"
                className={BUTTON}
                disabled={pending}
                onClick={() =>
                  run(() => reviewRevisionAction({ measureId, revisionId: action.revisionId }))
                }
              >
                Marquer comme relue
              </button>
            );
          }
          if (action.kind === "publish") {
            return (
              <button
                key={`publish-${action.revisionId}`}
                type="button"
                className={BUTTON}
                disabled={pending}
                onClick={() =>
                  run(() =>
                    publishRevisionAction({
                      measureId,
                      revisionId: action.revisionId,
                      expectedUpdatedAt,
                    })
                  )
                }
              >
                {action.isFirstPublication ? "Publier cette version" : "Publier cette correction"}
              </button>
            );
          }
          const key = action.kind === "reject" ? `reject-${action.revisionId}` : action.kind;
          const label =
            action.kind === "reject"
              ? "Rejeter la proposition"
              : action.kind === "draft"
                ? action.preservesEvidenceFromRevisionId
                  ? "Corriger la proposition"
                  : "Saisir une nouvelle révision"
                : action.kind === "depublish"
                  ? "Dépublier"
                  : "Enregistrer un retrait du candidat";
          return (
            <button
              key={key}
              type="button"
              className={action.kind === "draft" ? BUTTON : DANGER}
              disabled={pending}
              aria-expanded={open === key}
              onClick={() => setOpen(open === key ? null : key)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {canGenerateContext && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Mistral utilise uniquement les unités de preuve enregistrées. Le résultat crée un
          brouillon invisible du public, à relire avant publication.
        </p>
      )}

      {actions.map((action) => (
        <MeasureActionForm
          key={action.kind === "reject" ? `reject-${action.revisionId}` : action.kind}
          openKey={open}
          action={action}
          measureId={measureId}
          expectedUpdatedAt={expectedUpdatedAt}
          revisionTexts={revisionTexts}
          revisionDetails={revisionDetails}
          pending={pending}
          run={run}
        />
      ))}
    </div>
  );
}
