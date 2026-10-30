"use client";

import { useState, useTransition } from "react";
import { deleteDossierLinkAction } from "../actions";

export function DeleteDossierLinkButton({ linkId }: { linkId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm("Retirer ce rapprochement ? Il disparaît de la liste.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDossierLinkAction({ linkId });
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Retrait en cours" : "Retirer ce rapprochement"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
