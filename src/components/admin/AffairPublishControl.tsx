"use client";

import { useState, useTransition } from "react";
import { PublicationStatus } from "@/generated/prisma";
import type { BlockingDecision } from "@/lib/affairs/blocking-decisions";
import { MatchingResolutionPanel } from "@/components/admin/MatchingResolutionPanel";

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

  // Retrying only once everything is resolved keeps the guard's refusal meaningful:
  // a partial resolution would just produce the same error with one fewer decision.
  function handleAllResolved() {
    setBlocking([]);
    setNotice("Rattachement traité, nouvelle tentative de publication…");
    publish("PUBLISHED");
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
        <MatchingResolutionPanel
          key={blocking.map((d) => d.id).join(",")}
          politicianId={politicianId}
          politicianName={politicianName}
          decisions={blocking}
          onAllResolved={handleAllResolved}
        />
      )}
    </div>
  );
}
