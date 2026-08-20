"use client";

import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AdminEntityPicker } from "@/components/admin/AdminEntityPicker";
import { INVOLVEMENT_LABELS } from "@/config/labels";
import type { Involvement } from "@/generated/prisma";

interface LinkedAffair {
  id: string;
  title: string;
  slug: string;
  involvement: Involvement;
  linkedAffairId: string | null;
  politician: { id: string; fullName: string; slug: string };
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeId?: string;
  currentInvolvement?: Involvement;
}

export function LinkedAffairSelect({ value, onChange, excludeId, currentInvolvement }: Props) {
  const [selected, setSelected] = useState<LinkedAffair | null>(null);
  const search = useCallback(
    async (query: string, signal: AbortSignal) => {
      const params = new URLSearchParams({ q: query });
      if (excludeId) params.set("excludeId", excludeId);
      const response = await fetch(`/api/admin/affaires/search?${params.toString()}`, { signal });
      if (!response.ok) throw new Error("Recherche d’affaire indisponible");
      const data = (await response.json()) as { results: LinkedAffair[] };
      return data.results;
    },
    [excludeId]
  );
  const resolve = useCallback(async (id: string, signal: AbortSignal) => {
    const response = await fetch(`/api/admin/affaires/search?id=${encodeURIComponent(id)}`, {
      signal,
    });
    if (!response.ok) throw new Error("Impossible de charger l’affaire sélectionnée");
    const data = (await response.json()) as { results: LinkedAffair[] };
    return data.results[0] ?? null;
  }, []);

  const showSameInvolvementWarning = Boolean(
    selected && currentInvolvement && selected.involvement === currentInvolvement
  );
  const showChainWarning = Boolean(selected?.linkedAffairId);

  return (
    <div className="space-y-2">
      <AdminEntityPicker<LinkedAffair>
        value={value}
        onChange={(id, result) => {
          setSelected(result);
          onChange(id);
        }}
        onResolved={setSelected}
        search={search}
        resolve={resolve}
        renderResult={(affair) => (
          <div className="pr-5">
            <p className="font-medium">{affair.title}</p>
            <p className="text-xs text-muted-foreground">
              {affair.politician.fullName} · {INVOLVEMENT_LABELS[affair.involvement]}
            </p>
            <p className="text-xs text-muted-foreground">{affair.slug}</p>
          </div>
        )}
        label="Affaire liée (optionnel)"
        placeholder="Rechercher une affaire par titre..."
        description="La liaison conserve son sens actuel et exclut l’affaire en cours."
      />
      {showSameInvolvementWarning && (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Les deux affaires ont le même rôle ({INVOLVEMENT_LABELS[currentInvolvement!]}). Vérifiez
          la cohérence.
        </p>
      )}
      {showChainWarning && (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Cette affaire est déjà liée à une autre affaire. La liaison créerait une chaîne.
        </p>
      )}
    </div>
  );
}
