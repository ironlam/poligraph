"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { SCRUTIN_THEMES, type ScrutinTheme } from "@/config/scrutin-themes";

const NO_THEME = "AUCUN";

/**
 * One row of the theme queue: the model's proposal preselected, a select to correct it, and a
 * button that validates whatever is selected. "Aucun thème" stores null.
 */
export function FactcheckThemeValidation({
  factcheckId,
  proposed,
  validated,
}: {
  factcheckId: string;
  proposed: ScrutinTheme | null;
  validated: boolean;
}) {
  const selectId = useId();
  const [value, setValue] = useState<string>(proposed ?? NO_THEME);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        Thème
      </label>
      <select
        id={selectId}
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-11 rounded-md border bg-background px-2 text-sm"
      >
        <option value={NO_THEME}>Aucun thème</option>
        {SCRUTIN_THEMES.map((theme) => (
          <option key={theme} value={theme}>
            {THEME_CATEGORY_LABELS[theme]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await fetch(`/api/admin/factchecks/${factcheckId}/theme`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ theme: value === NO_THEME ? null : value }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => null);
              setError(data?.error ?? "La validation a échoué.");
              return;
            }
            router.refresh();
          });
        }}
        className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Validation…" : validated ? "Revalider" : "Valider"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
