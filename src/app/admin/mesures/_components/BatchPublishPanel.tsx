"use client";

import { useState, useTransition } from "react";
import { publishReviewedBatchAction, type BatchActionResult } from "../actions";
import type { BatchPublishGroup } from "../_data/batch-publish-query";

function BatchPublishCard({ group }: { group: BatchPublishGroup }) {
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<BatchActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const count = group.items.length;

  const publish = () => {
    if (!confirmed || isPending) return;
    startTransition(async () => {
      setResult(
        await publishReviewedBatchAction({
          items: group.items.map(({ measureId, revisionId, expectedUpdatedAt, batchKind }) => ({
            measureId,
            revisionId,
            expectedUpdatedAt,
            batchKind,
          })),
        })
      );
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
            , {group.electionTitle}, {count} révision{count > 1 ? "s" : ""} relue
            {count > 1 ? "s" : ""} et sourcée{count > 1 ? "s" : ""}
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
                    Contexte relu : {item.details}
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
          Cette édition contient plus de 100 révisions publiables. Ce lot porte sur les 100 plus
          anciennes. Le lot suivant apparaîtra après actualisation.
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
            Je confirme la publication de ces {count} révision{count > 1 ? "s" : ""}
          </label>
          <button
            type="button"
            onClick={publish}
            disabled={!confirmed || isPending}
            className="inline-flex min-h-11 items-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Publication en cours..." : `Publier le lot (${count})`}
          </button>
        </div>
      ) : (
        <div
          role="status"
          className={`mt-4 rounded border p-3 text-sm ${
            result.ok
              ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40"
              : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          }`}
        >
          <p className="font-medium">
            {result.publishedCount} révision{result.publishedCount > 1 ? "s" : ""} publiée
            {result.publishedCount > 1 ? "s" : ""}.
          </p>
          {!result.ok && (
            <>
              <p className="mt-1">
                {result.failures.length} élément{result.failures.length > 1 ? "s" : ""} refusé
                {result.failures.length > 1 ? "s" : ""}. Actualisez la page avant de réessayer.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.failures.map((failure) => (
                  <li key={failure.revisionId}>{failure.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export function BatchPublishPanel({ groups }: { groups: BatchPublishGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section
      aria-labelledby="batch-publish-heading"
      className="rounded-lg border border-border p-4"
    >
      <h2 id="batch-publish-heading" className="text-lg font-semibold">
        Publication par lot
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Les premières publications et les corrections de contexte déjà relues sont proposées. Une
        correction de contexte ne peut entrer dans un lot que si elle conserve exactement la
        formulation publique. Une transition complète contrôle encore chaque révision.
      </p>
      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <BatchPublishCard key={group.groupKey} group={group} />
        ))}
      </div>
    </section>
  );
}
