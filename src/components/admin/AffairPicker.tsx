"use client";

import { useCallback } from "react";
import {
  AdminEntityPicker,
  type AdminEntityPickerResult,
} from "@/components/admin/AdminEntityPicker";
import { INVOLVEMENT_LABELS } from "@/config/labels";
import type { Involvement, PublicationStatus } from "@/generated/prisma";

export interface AffairPickerResult extends AdminEntityPickerResult {
  title: string;
  slug: string;
  involvement: Involvement;
  publicationStatus: PublicationStatus;
  linkedAffairId: string | null;
  politician: { id: string; fullName: string; slug: string };
}

async function requestAffairs(url: string, signal: AbortSignal): Promise<AffairPickerResult[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Recherche d’affaire indisponible");
  const data = (await response.json()) as { results?: AffairPickerResult[] };
  return data.results ?? [];
}

export function AffairPicker({
  value,
  onChange,
  onResolved,
  excludeId,
  label = "Affaire",
  description,
}: {
  value: string | null;
  onChange: (value: string | null, result: AffairPickerResult | null) => void;
  onResolved?: (result: AffairPickerResult | null) => void;
  excludeId?: string;
  label?: string;
  description?: string;
}) {
  const search = useCallback(
    (query: string, signal: AbortSignal) => {
      const params = new URLSearchParams({ q: query });
      if (excludeId) params.set("excludeId", excludeId);
      return requestAffairs(`/api/admin/affaires/search?${params.toString()}`, signal);
    },
    [excludeId]
  );
  const resolve = useCallback(
    (id: string, signal: AbortSignal) =>
      requestAffairs(`/api/admin/affaires/search?id=${encodeURIComponent(id)}`, signal).then(
        (items) => items[0] ?? null
      ),
    []
  );

  return (
    <AdminEntityPicker<AffairPickerResult>
      value={value}
      onChange={onChange}
      onResolved={onResolved}
      search={search}
      resolve={resolve}
      renderResult={(affair) => (
        <div className="pr-5">
          <p className="font-medium">{affair.title}</p>
          <p className="text-xs text-muted-foreground">
            {affair.politician.fullName} · {INVOLVEMENT_LABELS[affair.involvement]} ·{" "}
            {affair.publicationStatus}
          </p>
          <p className="text-xs text-muted-foreground">{affair.slug}</p>
        </div>
      )}
      label={label}
      placeholder="Rechercher une affaire par titre..."
      description={description}
    />
  );
}
