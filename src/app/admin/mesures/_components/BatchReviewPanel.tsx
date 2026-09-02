"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewDraftBatchAction, type BatchReviewActionResult } from "../actions";
import type { BatchReviewGroup } from "../_data/batch-review-query";

function BatchReviewCard({ group }: { group: BatchReviewGroup }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Extract<BatchReviewActionResult, { ok: false }> | null>(
    null
  );
  const [isPending, startTransition] = useTransition();
  const count = group.items.length;

  const review = () => {
    if (!confirmed || isPending) return;
    startTransition(async () => {
      const actionResult = await reviewDraftBatchAction({
        items: group.items.map(({ measureId, revisionId, batchKind }) => ({
          measureId,
          revisionId,
          batchKind,
        })),
      });
      if (actionResult.ok) {
        router.refresh();
        return;
      }
      setResult(actionResult);
    });
  };

  return (
    <article className="rounded border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {group.ownerLabel}, {group.editionLabel} (version {group.editionVersion})
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {group.batchKind === "CONTEXT_CORRECTION"
              ? "Corrections de contexte"
              : "Premières publications"}
            , {group.electionTitle}, {count} brouillon{count > 1 ? "s" : ""} sourcé
            {count > 1 ? "s" : ""}
          </p>
        </div>
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 text-primary underline">
            Vérifier le contenu du lot
          </summary>
          <ol className="mt-2 max-h-96 max-w-3xl list-decimal space-y-4 overflow-y-auto pl-5">
            {group.items.map((item) => (
              <li key={item.revisionId}>
                <span className="font-medium">{item.text}</span>
                {item.details ? (
                  <span className="mt-1 block text-muted-foreground">
                    Contexte proposé : {item.details}
                  </span>
                ) : null}
                <a
                  href={`/admin/mesures/${item.measureId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Vérifier la mesure et ses preuves dans un nouvel onglet : ${item.text}`}
                  className="mt-2 inline-flex min-h-11 items-center text-primary underline"
                >
                  Vérifier la mesure et ses preuves
                </a>
              </li>
            ))}
          </ol>
        </details>
      </div>

      {group.hasMore && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          Cette édition contient plus de 100 brouillons à relire. Ce lot porte sur les 100 plus
          anciens. Le lot suivant apparaîtra après actualisation.
        </p>
      )}

      {result === null ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="h-5 w-5"
            />
            Je confirme avoir relu ces {count} révision{count > 1 ? "s" : ""}
          </label>
          <button
            type="button"
            onClick={review}
            disabled={!confirmed || isPending}
            className="inline-flex min-h-11 items-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Relecture en cours..." : `Marquer le lot comme relu (${count})`}
          </button>
        </div>
      ) : (
        <div
          role="status"
          className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          <p className="font-medium">
            {result.reviewedCount} révision{result.reviewedCount > 1 ? "s" : ""} relue
            {result.reviewedCount > 1 ? "s" : ""}.
          </p>
          <p className="mt-1">
            {result.failures.length} élément{result.failures.length > 1 ? "s" : ""} refusé
            {result.failures.length > 1 ? "s" : ""}. Actualisez la page avant de réessayer.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.failures.map((failure) => (
              <li key={failure.revisionId}>{failure.message}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function BatchReviewPanel({ groups }: { groups: BatchReviewGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="batch-review-heading" className="rounded-lg border border-border p-4">
      <h2 id="batch-review-heading" className="text-lg font-semibold">
        Relecture par lot
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Chaque lot contient uniquement des brouillons actifs et sourcés. Les corrections de contexte
        sont incluses seulement si la formulation publique reste strictement identique. Cette étape
        ne publie rien. Une fois la relecture enregistrée, le lot passe dans la section de
        publication.
      </p>
      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <BatchReviewCard key={group.groupKey} group={group} />
        ))}
      </div>
    </section>
  );
}
