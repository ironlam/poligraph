"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const NOTE_MAX = 140;

type DeferReason = "DELIBERE" | "AUDIENCE" | "MANUEL";

const DEFER_REASONS: { value: DeferReason; label: string }[] = [
  { value: "DELIBERE", label: "Délibéré" },
  { value: "AUDIENCE", label: "Audience" },
  { value: "MANUEL", label: "Manuel" },
];

/**
 * Boutons de revue d'une affaire suivie. La clé de requête est créée au montage et ne change
 * qu'après un succès : un double clic rejoue la même requête, que le serveur dédoublonne.
 */
export function AffairMonitoringActions({
  affairId,
  minDate,
  showNoChange = true,
}: {
  affairId: string;
  /** Faux quand l'affaire n'a pas de suivi actif : « Rien de neuf » y renverrait une 404. */
  showNoChange?: boolean;
  /** Lendemain (jour de Paris) au format AAAA-MM-JJ. */
  minDate: string;
}) {
  const router = useRouter();
  // Une clé par type d'action : celle d'un « rien de neuf » ne peut pas dédoublonner un report.
  const [keys, setKeys] = useState(() => ({
    NO_CHANGE: crypto.randomUUID(),
    DEFER: crypto.randomUUID(),
  }));
  const [deferOpen, setDeferOpen] = useState(false);
  const [date, setDate] = useState("");
  const [dueReason, setDueReason] = useState<DeferReason>("MANUEL");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "NO_CHANGE" | "DEFER", body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/affaires/${affairId}/suivi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, action, requestKey: keys[action] }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "L'enregistrement a échoué.");
        return;
      }
      setKeys((k) => ({ ...k, [action]: crypto.randomUUID() }));
      setDeferOpen(false);
      setDate("");
      setNote("");
      router.refresh();
    } catch {
      setError("L'enregistrement a échoué.");
    } finally {
      setPending(false);
    }
  }

  const fieldId = `suivi-${affairId}`;

  // Fragment: placé dans un parent « flex flex-wrap », le formulaire passe sur sa propre ligne
  // sous la ligne de l'affaire.
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {showNoChange && (
          <Button
            type="button"
            className="min-h-11"
            disabled={pending}
            onClick={() => send("NO_CHANGE", {})}
          >
            Rien de neuf
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-expanded={deferOpen}
          aria-controls={`${fieldId}-defer`}
          disabled={pending}
          onClick={() => setDeferOpen((open) => !open)}
        >
          Reporter…
        </Button>
      </div>
      {deferOpen && (
        <form
          id={`${fieldId}-defer`}
          className="grid w-full basis-full gap-3 rounded-md border p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send("DEFER", {
              nextReviewAt: date,
              dueReason,
              ...(note.trim() ? { dueNote: note.trim() } : {}),
            });
          }}
        >
          <div className="space-y-1">
            <label htmlFor={`${fieldId}-date`} className="text-sm font-medium">
              Date de la prochaine revue
            </label>
            <input
              id={`${fieldId}-date`}
              type="date"
              required
              min={minDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${fieldId}-reason`} className="text-sm font-medium">
              Motif
            </label>
            <select
              id={`${fieldId}-reason`}
              value={dueReason}
              onChange={(event) => setDueReason(event.target.value as DeferReason)}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              {DEFER_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor={`${fieldId}-note`} className="text-sm font-medium">
              Note (facultative, {NOTE_MAX} caractères au plus)
            </label>
            <input
              id={`${fieldId}-note`}
              type="text"
              maxLength={NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={pending || !date}>
              Enregistrer le report
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="w-full basis-full text-sm font-medium text-destructive">
          Erreur : {error}
        </p>
      )}
    </>
  );
}
