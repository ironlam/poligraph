"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";
import type { PromiseExtractionStatus, ThemeCategory } from "@/types";

interface Props {
  promiseId: string;
  currentTheme: ThemeCategory;
  currentStatus: PromiseExtractionStatus;
}

export function PromiseModerationActions({ promiseId, currentTheme, currentStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemeCategory>(currentTheme);
  const [rejectionReason, setRejectionReason] = useState("");

  async function callPatch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/promises/${promiseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/promises/${promiseId}/verify`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectionReason.trim()) {
      alert("Indiquez une raison de rejet.");
      return;
    }
    await callPatch({ extractionStatus: "REJECTED", rejectionReason });
  }

  async function needsReview() {
    await callPatch({ extractionStatus: "NEEDS_REVIEW" });
  }

  async function saveTheme() {
    if (theme !== currentTheme) await callPatch({ theme });
  }

  async function remove() {
    if (!confirm("Supprimer définitivement cette promesse ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/promises/${promiseId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      window.location.href = "/admin/promises";
    } catch (err) {
      alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block font-medium mb-1">Corriger le thème</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeCategory)}
            className="border rounded px-2 py-1 bg-background"
            disabled={busy}
          >
            {LEGACY_THEME_CATEGORIES.map((k) => {
              const l = THEME_CATEGORY_LABELS[k];
              return (
                <option key={k} value={k}>
                  {l}
                </option>
              );
            })}
          </select>
        </label>
        <Button onClick={saveTheme} disabled={busy || theme === currentTheme}>
          Sauvegarder le thème
        </Button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="rejection-reason">
          Raison de rejet
        </label>
        <textarea
          id="rejection-reason"
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm bg-background"
          rows={2}
          maxLength={500}
          disabled={busy}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={publish} disabled={busy || currentStatus === "PUBLISHED"}>
          Publier
        </Button>
        <Button variant="outline" onClick={needsReview} disabled={busy}>
          À retraiter
        </Button>
        <Button variant="destructive" onClick={reject} disabled={busy}>
          Rejeter
        </Button>
        <Button variant="destructive" onClick={remove} disabled={busy}>
          Supprimer
        </Button>
      </div>
    </div>
  );
}
