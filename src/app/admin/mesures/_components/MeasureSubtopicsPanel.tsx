"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MAX_SUBTOPICS_PER_REVISION } from "@/config/measure-subtopics";
import type { MeasureSubtopicAssignmentStatus } from "@/generated/prisma";
import {
  addSubtopicAction,
  proposeSubtopicsAction,
  reviewSubtopicAction,
  type ActionResult,
} from "../actions";

export type MeasureSubtopicAssignment = {
  subtopicId: string;
  label: string;
  status: MeasureSubtopicAssignmentStatus;
  confidence: number | null;
};

export function MeasureSubtopicsPanel({
  measureId,
  revisionId,
  assignments,
  addableSubtopics = [],
}: {
  measureId: string;
  revisionId: string | null;
  assignments: MeasureSubtopicAssignment[];
  /** Subtopics of the measure's theme a human can still add; empty hides the picker. */
  addableSubtopics?: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  function run(action: () => Promise<ActionResult>): void {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFailure(result.message);
        return;
      }
      router.refresh();
    });
  }

  if (!revisionId) {
    return <p className="text-sm text-muted-foreground">Aucune révision à classer.</p>;
  }

  const approved = assignments.filter((item) => item.status === "APPROVED");
  const suggested = assignments.filter((item) => item.status === "SUGGESTED");
  const rejected = assignments.filter((item) => item.status === "REJECTED");

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        L’IA propose uniquement des termes de la taxonomie du thème principal. Rien n’est public
        avant une validation humaine.
      </p>

      {failure && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {failure}
        </p>
      )}

      {approved.length > 0 && (
        <div>
          <h3 className="text-sm font-bold">Sous-thèmes validés</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {approved.map((item) => (
              <li key={item.subtopicId} className="rounded-full bg-primary/10 px-3 py-1 text-sm">
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggested.length > 0 ? (
        <div>
          <h3 className="text-sm font-bold">Propositions à examiner</h3>
          <ul className="mt-2 space-y-2">
            {suggested.map((item) => (
              <li
                key={item.subtopicId}
                className="flex flex-col gap-3 rounded border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm">
                  <span className="font-bold">{item.label}</span>
                  {item.confidence !== null && (
                    <span className="ml-2 text-muted-foreground">
                      confiance {Math.round(item.confidence * 100)} %
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        reviewSubtopicAction({
                          measureId,
                          revisionId,
                          subtopicId: item.subtopicId,
                          status: "APPROVED",
                        })
                      )
                    }
                  >
                    Valider
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        reviewSubtopicAction({
                          measureId,
                          revisionId,
                          subtopicId: item.subtopicId,
                          status: "REJECTED",
                        })
                      )
                    }
                  >
                    Refuser
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune proposition en attente.</p>
      )}

      {rejected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {rejected.length}{" "}
          {rejected.length === 1 ? "proposition refusée" : "propositions refusées"}
        </p>
      )}

      {approved.length < MAX_SUBTOPICS_PER_REVISION && addableSubtopics.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor={`add-subtopic-${revisionId}`} className="text-sm font-bold">
              Ajouter un sous-thème
            </label>
            <select
              id={`add-subtopic-${revisionId}`}
              value={selectedId}
              disabled={pending}
              onChange={(event) => setSelectedId(event.target.value)}
              className="min-h-11 rounded border border-border bg-background px-3 text-sm"
            >
              <option value="">Choisir un sous-thème</option>
              {addableSubtopics.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="default"
            className="min-h-11"
            disabled={pending || selectedId === ""}
            onClick={() => {
              const subtopicId = selectedId;
              setSelectedId("");
              run(() => addSubtopicAction({ measureId, revisionId, subtopicId }));
            }}
          >
            Ajouter
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={pending || approved.length >= MAX_SUBTOPICS_PER_REVISION}
        onClick={() => run(() => proposeSubtopicsAction({ measureId, revisionId }))}
      >
        {pending ? "Traitement en cours…" : "Proposer des sous-thèmes"}
      </Button>
      {approved.length >= MAX_SUBTOPICS_PER_REVISION ? (
        <p className="text-xs text-muted-foreground">
          Trois sous-thèmes sont validés : le maximum est atteint.
        </p>
      ) : (
        approved.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Les sous-thèmes validés sont conservés. La proposition automatique complète seulement
            les places libres (trois au maximum).
          </p>
        )
      )}
    </div>
  );
}
