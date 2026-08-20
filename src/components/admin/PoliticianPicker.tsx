"use client";

import { useCallback } from "react";
import {
  AdminEntityPicker,
  type AdminEntityPickerResult,
} from "@/components/admin/AdminEntityPicker";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import type { MandateType, PublicationStatus } from "@/generated/prisma";

export interface PoliticianPickerResult extends AdminEntityPickerResult {
  fullName: string;
  slug: string;
  publicationStatus: PublicationStatus;
  party: { shortName: string | null; name: string } | null;
  mandate: {
    type: MandateType;
    title: string;
    institution: string;
    constituency: string | null;
  } | null;
}

async function requestPoliticians(
  url: string,
  signal: AbortSignal
): Promise<PoliticianPickerResult[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Recherche indisponible");
  const data = (await response.json()) as {
    results?: PoliticianPickerResult[];
    result?: PoliticianPickerResult | null;
  };
  return data.results ?? (data.result ? [data.result] : []);
}

function renderPolitician(politician: PoliticianPickerResult) {
  return (
    <div className="pr-5">
      <p className="font-medium">{politician.fullName}</p>
      <p className="text-xs text-muted-foreground">
        {politician.party?.shortName || politician.party?.name || "Sans parti"} ·{" "}
        {politician.mandate
          ? MANDATE_TYPE_LABELS[politician.mandate.type]
          : "Fonction non renseignée"}
      </p>
      <p className="text-xs text-muted-foreground">
        {politician.slug} · {politician.publicationStatus}
      </p>
    </div>
  );
}

export function PoliticianPicker({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  label = "Personnalité politique",
  description,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  readOnly?: boolean;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  const search = useCallback(
    (query: string, signal: AbortSignal) =>
      requestPoliticians(
        `/api/admin/entities/politicians?q=${encodeURIComponent(query)}&page=1&limit=20`,
        signal
      ),
    []
  );
  const resolve = useCallback(
    (id: string, signal: AbortSignal) =>
      requestPoliticians(
        `/api/admin/entities/politicians?id=${encodeURIComponent(id)}`,
        signal
      ).then((items) => items[0] ?? null),
    []
  );

  return (
    <AdminEntityPicker<PoliticianPickerResult>
      value={value}
      onChange={(next) => onChange(next)}
      search={search}
      resolve={resolve}
      renderResult={renderPolitician}
      label={label}
      placeholder="Rechercher par nom, prénom, parti ou slug..."
      readOnly={readOnly}
      disabled={disabled}
      description={description}
    />
  );
}
