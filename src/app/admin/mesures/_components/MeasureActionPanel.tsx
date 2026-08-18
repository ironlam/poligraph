"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  MEASURE_REJECTION_REASON_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
} from "@/config/labels";
import type { MeasureRejectionReason, MeasureSourceKind, SourceTier } from "@/generated/prisma";
import type { AvailableAction } from "../_data/available-actions";
import {
  depublishMeasureAction,
  draftRevisionAction,
  publishRevisionAction,
  reviewRevisionAction,
  rejectRevisionAction,
  withdrawMeasureAction,
  type ActionResult,
} from "../actions";

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

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const DANGER =
  "inline-flex min-h-11 items-center justify-center rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
const FIELD = "mt-1 min-h-11 w-full rounded border border-border bg-background px-3 py-2 text-sm";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const SOURCE_KINDS = Object.keys(MEASURE_SOURCE_KIND_LABELS) as MeasureSourceKind[];
const TIERS = Object.keys(SOURCE_TIER_LABELS) as SourceTier[];
const REJECTION_REASONS = Object.keys(MEASURE_REJECTION_REASON_LABELS) as MeasureRejectionReason[];

function excerpt(text: string | undefined): string {
  if (text === undefined) return "révision inconnue";
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export function MeasureActionPanel({
  measureId,
  expectedUpdatedAt,
  actions,
  revisionTexts,
  isWithdrawn,
  pointersAmbiguous,
}: {
  measureId: string;
  expectedUpdatedAt: string;
  actions: AvailableAction[];
  revisionTexts: Record<string, string>;
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

  if (actions.length === 0) {
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

      {actions.map((action) => {
        if (action.kind === "reject" && open === `reject-${action.revisionId}`) {
          return (
            <form
              key="reject-form"
              className="rounded border border-border p-3 text-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  rejectRevisionAction({
                    measureId,
                    revisionId: action.revisionId,
                    reason: String(data.get("reason")) as MeasureRejectionReason,
                    detail: String(data.get("detail") ?? "").trim() || null,
                  })
                );
              }}
            >
              <p>
                Rejeter définitivement cette proposition :{" "}
                <em>{excerpt(revisionTexts[action.revisionId])}</em>
              </p>
              <label
                htmlFor={`reject-reason-${action.revisionId}`}
                className={`${LABEL} mt-3 block`}
              >
                Motif
              </label>
              <select id={`reject-reason-${action.revisionId}`} name="reason" className={FIELD}>
                {REJECTION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {MEASURE_REJECTION_REASON_LABELS[reason]}
                  </option>
                ))}
              </select>
              <label
                htmlFor={`reject-detail-${action.revisionId}`}
                className={`${LABEL} mt-3 block`}
              >
                Précision facultative
              </label>
              <textarea
                id={`reject-detail-${action.revisionId}`}
                name="detail"
                rows={2}
                className={FIELD}
              />
              <button type="submit" className={`${DANGER} mt-2`} disabled={pending}>
                Confirmer le rejet
              </button>
            </form>
          );
        }

        if (action.kind === "depublish" && open === "depublish") {
          return (
            <form
              key="depublish-form"
              className="rounded border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  depublishMeasureAction({
                    measureId,
                    reason: String(data.get("reason") ?? ""),
                    expectedUpdatedAt,
                  })
                );
              }}
            >
              <label htmlFor="depublish-reason" className={LABEL}>
                Motif de la dépublication
              </label>
              <textarea
                id="depublish-reason"
                name="reason"
                required
                rows={3}
                className={FIELD}
                placeholder="Pourquoi ce texte doit cesser d'être affiché"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                La dépublication est notre acte : elle retire le texte du site sans rien changer à
                ce que le candidat a dit.
              </p>
              <button type="submit" className={`${DANGER} mt-2`} disabled={pending}>
                Dépublier maintenant
              </button>
            </form>
          );
        }

        if (action.kind === "withdraw" && open === "withdraw") {
          return (
            <form
              key="withdraw-form"
              className="rounded border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  withdrawMeasureAction({
                    measureId,
                    withdrawnAt: String(data.get("withdrawnAt") ?? ""),
                    sourceUrl: String(data.get("sourceUrl") ?? ""),
                    sourceLabel: String(data.get("sourceLabel") ?? ""),
                    expectedUpdatedAt,
                  })
                );
              }}
            >
              <p className="text-sm">
                Le retrait est l&apos;acte du <strong>candidat</strong>, pas le nôtre. La mesure
                reste affichée avec son état de retrait, contrairement à une dépublication.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="withdraw-date" className={LABEL}>
                    Date du retrait
                  </label>
                  <input
                    id="withdraw-date"
                    name="withdrawnAt"
                    type="date"
                    required
                    className={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="withdraw-url" className={LABEL}>
                    URL de la source
                  </label>
                  <input id="withdraw-url" name="sourceUrl" type="url" required className={FIELD} />
                </div>
                <div>
                  <label htmlFor="withdraw-label" className={LABEL}>
                    Libellé de la source
                  </label>
                  <input
                    id="withdraw-label"
                    name="sourceLabel"
                    type="text"
                    required
                    className={FIELD}
                  />
                </div>
              </div>
              <button type="submit" className={`${DANGER} mt-3`} disabled={pending}>
                Enregistrer le retrait
              </button>
            </form>
          );
        }

        if (action.kind === "draft" && open === "draft") {
          return (
            <form
              key="draft-form"
              className="rounded border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  draftRevisionAction({
                    measureId,
                    expectedUpdatedAt,
                    preserveEvidenceFromRevisionId: action.preservesEvidenceFromRevisionId,
                    revision: {
                      text: String(data.get("text") ?? ""),
                      precision:
                        String(data.get("precision") ?? "") === ""
                          ? null
                          : (String(data.get("precision")) as "CHIFFREE" | "OBJECTIF_SANS_CHIFFRE"),
                      validFrom: String(data.get("validFrom") ?? ""),
                      extractionMethod: "MANUAL",
                    },
                    sources: action.preservesEvidenceFromRevisionId
                      ? []
                      : [
                          {
                            sourceKind: String(data.get("sourceKind")) as MeasureSourceKind,
                            tier: String(data.get("tier")) as SourceTier,
                            url: String(data.get("sourceUrl") ?? ""),
                            page: String(data.get("page") ?? "") || null,
                            publishedAt: String(data.get("sourcePublishedAt") ?? ""),
                          },
                        ],
                  })
                );
              }}
            >
              <label htmlFor="draft-text" className={LABEL}>
                Texte de la nouvelle révision
              </label>
              <textarea
                id="draft-text"
                name="text"
                required
                rows={3}
                className={FIELD}
                defaultValue={
                  action.preservesEvidenceFromRevisionId
                    ? revisionTexts[action.preservesEvidenceFromRevisionId]
                    : undefined
                }
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="draft-validfrom" className={LABEL}>
                    En vigueur à partir du
                  </label>
                  <input
                    id="draft-validfrom"
                    name="validFrom"
                    type="date"
                    required
                    className={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="draft-precision" className={LABEL}>
                    Précision
                  </label>
                  <select id="draft-precision" name="precision" className={FIELD}>
                    <option value="">Non qualifiée</option>
                    <option value="CHIFFREE">Chiffrée</option>
                    <option value="OBJECTIF_SANS_CHIFFRE">Objectif sans chiffre</option>
                  </select>
                </div>
              </div>

              {!action.preservesEvidenceFromRevisionId && (
                <fieldset className="mt-3">
                  <legend className={LABEL}>Source de cette formulation</legend>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Une révision sans source ne peut pas être publiée, donc elle est exigée ici.
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="draft-sourcekind" className={LABEL}>
                        Nature
                      </label>
                      <select id="draft-sourcekind" name="sourceKind" className={FIELD}>
                        {SOURCE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {MEASURE_SOURCE_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="draft-tier" className={LABEL}>
                        Rang
                      </label>
                      <select id="draft-tier" name="tier" className={FIELD}>
                        {TIERS.map((tier) => (
                          <option key={tier} value={tier}>
                            {SOURCE_TIER_LABELS[tier]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="draft-sourceurl" className={LABEL}>
                        URL
                      </label>
                      <input
                        id="draft-sourceurl"
                        name="sourceUrl"
                        type="url"
                        required
                        className={FIELD}
                      />
                    </div>
                    <div>
                      <label htmlFor="draft-sourcedate" className={LABEL}>
                        Date de la source
                      </label>
                      <input
                        id="draft-sourcedate"
                        name="sourcePublishedAt"
                        type="date"
                        required
                        className={FIELD}
                      />
                    </div>
                    <div>
                      <label htmlFor="draft-page" className={LABEL}>
                        Page (facultatif)
                      </label>
                      <input id="draft-page" name="page" type="text" className={FIELD} />
                    </div>
                  </div>
                </fieldset>
              )}

              <button type="submit" className={`${BUTTON} mt-3`} disabled={pending}>
                Enregistrer le brouillon
              </button>
            </form>
          );
        }

        return null;
      })}
    </div>
  );
}
