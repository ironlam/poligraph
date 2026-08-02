"use client";

import { useState, useTransition } from "react";
import { PublicationStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import type { BlockingDecision } from "@/lib/affairs/blocking-decisions";

const STATUS_OPTIONS: { value: PublicationStatus; label: string }[] = [
  { value: "DRAFT", label: "Brouillon" },
  { value: "PUBLISHED", label: "Publié" },
  { value: "REJECTED", label: "Rejeté" },
  { value: "ARCHIVED", label: "Archivé" },
  { value: "EXCLUDED", label: "Exclu" },
];

const STATUS_STYLES: Record<PublicationStatus, string> = {
  DRAFT: "border-amber-300 bg-amber-50 text-amber-700",
  PUBLISHED: "border-emerald-300 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-300 bg-red-50 text-red-700",
  ARCHIVED: "border-slate-300 bg-slate-50 text-slate-500",
  EXCLUDED: "border-gray-300 bg-gray-50 text-gray-500",
};

export interface PublishRefusal {
  ok: false;
  error: string;
  blocking?: BlockingDecision[];
}

type ChangeResult = void | { ok: boolean; error?: string; blocking?: BlockingDecision[] };

interface Props {
  affairId: string;
  /** The person the affair is about. Confirming attaches the decision to them. */
  politicianId: string;
  politicianName: string;
  currentStatus: PublicationStatus;
  onChange: (id: string, status: PublicationStatus) => Promise<ChangeResult>;
}

/**
 * Publication control for an affair, with the matching blocks resolvable in place.
 *
 * Separate from `PublicationStatusSelect`, which factchecks also use: the panel below is
 * affair-specific and a shared component should not grow a branch for one caller.
 *
 * The panel always shows the press excerpt. Confirming from a « Publier » button without
 * reading the text is how a name-only match gets rubber-stamped, and that is exactly what
 * the guard exists to prevent, so the evidence is not behind a disclosure.
 */
export function AffairPublishControl({
  affairId,
  politicianId,
  politicianName,
  currentStatus,
  onChange,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingDecision[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function publish(status: PublicationStatus) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await onChange(affairId, status);
      if (result && result.ok === false) {
        setError(result.error ?? "La mise à jour a échoué");
        setBlocking(result.blocking ?? []);
        return;
      }
      setBlocking([]);
    });
  }

  async function resolve(decisionId: string, action: "confirm" | "reject") {
    setResolving(decisionId);
    setError(null);
    try {
      const response = await fetch(
        action === "confirm"
          ? "/api/admin/affair-matching/confirm"
          : "/api/admin/affair-matching/reject",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "confirm"
              ? { decisionId, chosenPoliticianId: politicianId }
              : { decisionId, action: "MOVE_TO_NO_MATCH" }
          ),
        }
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Le rattachement n'a pas pu être traité");
        return;
      }

      const left = blocking.filter((d) => d.id !== decisionId);
      setBlocking(left);

      // Retrying only once everything is resolved keeps the guard's refusal meaningful:
      // a partial resolution would just produce the same error with one fewer decision.
      if (left.length === 0) {
        setNotice("Rattachement traité, nouvelle tentative de publication…");
        publish("PUBLISHED");
      }
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <select
        value={currentStatus}
        disabled={isPending}
        aria-label="Statut de publication"
        className={`h-8 rounded-md border px-2 text-sm font-medium cursor-pointer appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${STATUS_STYLES[currentStatus]} ${isPending ? "opacity-50 cursor-wait" : ""}`}
        onChange={(e) => {
          const next = e.target.value as PublicationStatus;
          if (next === currentStatus) return;
          publish(next);
        }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="max-w-xs text-right text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      {blocking.length > 0 && (
        <section
          aria-label="Rattachements à valider"
          className="w-full max-w-2xl rounded-md border border-amber-300 bg-amber-50 p-3 text-left dark:border-amber-900/50 dark:bg-amber-950/30"
        >
          <h4 className="text-sm font-semibold">
            {blocking.length === 1
              ? "Un rattachement à valider avant publication"
              : `${blocking.length} rattachements à valider avant publication`}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Ce texte parle-t-il bien de {politicianName} ?
          </p>

          <ul className="mt-3 space-y-3">
            {blocking.map((d) => (
              <li key={d.id} className="rounded border bg-background p-2">
                <blockquote className="text-xs leading-relaxed text-muted-foreground">
                  « {d.excerpt} »
                </blockquote>

                <p className="mt-2 text-xs">
                  <span className="text-muted-foreground">Source : </span>
                  {d.sourceRef ? (
                    <a
                      href={d.sourceRef}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {d.source}
                    </a>
                  ) : (
                    d.source
                  )}
                </p>

                {d.candidates.slice(0, 2).map((c) => (
                  <div key={c.politicianId} className="mt-2 text-xs">
                    <span className="font-medium">{c.fullName}</span>
                    <span className="text-muted-foreground"> · score {c.score.toFixed(1)}</span>
                    {c.supporting.length > 0 && (
                      <ul className="ml-3 list-disc text-muted-foreground">
                        {c.supporting.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    )}
                    {c.opposing.length > 0 && (
                      <ul className="ml-3 list-disc text-red-700 dark:text-red-400">
                        {c.opposing.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={resolving === d.id || isPending}
                    onClick={() => resolve(d.id, "confirm")}
                  >
                    {resolving === d.id ? "…" : `Oui, c'est ${politicianName}`}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolving === d.id || isPending}
                    onClick={() => resolve(d.id, "reject")}
                  >
                    Non, ce n&apos;est pas la bonne personne
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
