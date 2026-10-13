"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DECISION_TRANSITION_LABELS } from "@/config/decisions-territoriales";

type Action = keyof typeof DECISION_TRANSITION_LABELS;

/** Transitions of one import batch. Errors from the API are shown in the form, never as an alert. */
export function LotTransitions({ lotId, actions }: { lotId: string; actions: Action[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReviewer = actions.includes("PUBLISH");
  const needsReason = actions.includes("REJECT") || actions.includes("UNPUBLISH");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/territoires/reperes/${lotId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: submitter?.value,
          reviewedBy: String(data.get("reviewedBy") ?? "").trim() || null,
          reason: String(data.get("reason") ?? "").trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0) return null;
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {needsReviewer && (
        <div className="space-y-1.5">
          <Label htmlFor={`reviewedBy-${lotId}`}>Relu par (nom)</Label>
          <Input id={`reviewedBy-${lotId}`} name="reviewedBy" maxLength={100} />
        </div>
      )}
      {needsReason && (
        <div className="space-y-1.5">
          <Label htmlFor={`reason-${lotId}`}>Motif (rejet ou dépublication)</Label>
          <Input id={`reason-${lotId}`} name="reason" maxLength={500} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            type="submit"
            name="action"
            value={action}
            disabled={busy}
            variant="outline"
          >
            {DECISION_TRANSITION_LABELS[action]}
          </Button>
        ))}
      </div>
    </form>
  );
}
