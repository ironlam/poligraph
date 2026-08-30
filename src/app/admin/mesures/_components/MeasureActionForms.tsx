"use client";

import {
  MEASURE_REJECTION_REASON_LABELS,
  MEASURE_PRECISION_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
} from "@/config/labels";
import type { MeasureRejectionReason, MeasureSourceKind, SourceTier } from "@/generated/prisma";
import type { AvailableAction } from "../_data/available-actions";
import {
  depublishMeasureAction,
  draftRevisionAction,
  rejectRevisionAction,
  withdrawMeasureAction,
  type ActionResult,
} from "../actions";
import {
  BUTTON,
  DANGER,
  FIELD,
  LABEL,
  PRECISIONS,
  REJECTION_REASONS,
  SOURCE_KINDS,
  TIERS,
  excerpt,
} from "./measure-action-styles";

/**
 * The four confirmation forms of the measure action panel.
 *
 * They lived inside a single 331-line arrow function inside a 504-line component, dispatched by a
 * chain of `if (action.kind === … && open === …)`. Each is now its own function with the same
 * props, so a change to the withdrawal form cannot disturb the rejection one.
 */
interface BaseFormProps {
  measureId: string;
  expectedUpdatedAt: string;
  revisionTexts: Record<string, string>;
  revisionDetails: Record<string, string | null>;
  pending: boolean;
  run: (action: () => Promise<ActionResult>) => void;
}

/** Each form declares the one action variant it handles, so the union stays narrowed. */
type FormProps<K extends AvailableAction["kind"]> = BaseFormProps & {
  action: Extract<AvailableAction, { kind: K }>;
};

function RejectRevisionForm({
  action,
  measureId,
  revisionTexts,
  pending,
  run,
}: FormProps<"reject">) {
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
      <label htmlFor={`reject-reason-${action.revisionId}`} className={`${LABEL} mt-3 block`}>
        Motif
      </label>
      <select id={`reject-reason-${action.revisionId}`} name="reason" className={FIELD}>
        {REJECTION_REASONS.map((reason) => (
          <option key={reason} value={reason}>
            {MEASURE_REJECTION_REASON_LABELS[reason]}
          </option>
        ))}
      </select>
      <label htmlFor={`reject-detail-${action.revisionId}`} className={`${LABEL} mt-3 block`}>
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

function DepublishForm({ measureId, expectedUpdatedAt, pending, run }: FormProps<"depublish">) {
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
        La dépublication est notre acte : elle retire le texte du site sans rien changer à ce que le
        candidat a dit.
      </p>
      <button type="submit" className={`${DANGER} mt-2`} disabled={pending}>
        Dépublier maintenant
      </button>
    </form>
  );
}

function WithdrawForm({ measureId, expectedUpdatedAt, pending, run }: FormProps<"withdraw">) {
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
        Le retrait est l&apos;acte du <strong>candidat</strong>, pas le nôtre. La mesure reste
        affichée avec son état de retrait, contrairement à une dépublication.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="withdraw-date" className={LABEL}>
            Date du retrait
          </label>
          <input id="withdraw-date" name="withdrawnAt" type="date" required className={FIELD} />
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
          <input id="withdraw-label" name="sourceLabel" type="text" required className={FIELD} />
        </div>
      </div>
      <button type="submit" className={`${DANGER} mt-3`} disabled={pending}>
        Enregistrer le retrait
      </button>
    </form>
  );
}

function DraftForm({
  action,
  measureId,
  expectedUpdatedAt,
  revisionTexts,
  revisionDetails,
  pending,
  run,
}: FormProps<"draft">) {
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
              details: String(data.get("details") ?? "").trim() || null,
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

      <label htmlFor="draft-details" className={`${LABEL} mt-3 block`}>
        Détails documentés (facultatif)
      </label>
      <textarea
        id="draft-details"
        name="details"
        rows={6}
        className={FIELD}
        defaultValue={
          action.preservesEvidenceFromRevisionId
            ? (revisionDetails[action.preservesEvidenceFromRevisionId] ?? undefined)
            : undefined
        }
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Contexte factuel présent dans les sources, sans analyse ni appréciation. Le Markdown simple
        est accepté.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="draft-validfrom" className={LABEL}>
            En vigueur à partir du
          </label>
          <input id="draft-validfrom" name="validFrom" type="date" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="draft-precision" className={LABEL}>
            Précision
          </label>
          <select id="draft-precision" name="precision" className={FIELD}>
            <option value="">Non qualifiée</option>
            {PRECISIONS.map((precision) => (
              <option key={precision} value={precision}>
                {MEASURE_PRECISION_LABELS[precision]}
              </option>
            ))}
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
              <input id="draft-sourceurl" name="sourceUrl" type="url" required className={FIELD} />
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

/** Renders the confirmation form matching the action the user opened, if any. */
export function MeasureActionForm({
  openKey,
  action,
  ...rest
}: BaseFormProps & { action: AvailableAction; openKey: string | null }) {
  const expected = action.kind === "reject" ? `reject-${action.revisionId}` : action.kind;
  if (openKey !== expected) return null;

  switch (action.kind) {
    case "reject":
      return <RejectRevisionForm action={action} {...rest} />;
    case "depublish":
      return <DepublishForm action={action} {...rest} />;
    case "withdraw":
      return <WithdrawForm action={action} {...rest} />;
    case "draft":
      return <DraftForm action={action} {...rest} />;
    default:
      return null;
  }
}
