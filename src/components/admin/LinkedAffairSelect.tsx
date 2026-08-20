"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AffairPicker, type AffairPickerResult } from "@/components/admin/AffairPicker";
import { INVOLVEMENT_LABELS } from "@/config/labels";
import type { Involvement } from "@/generated/prisma";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeId?: string;
  currentInvolvement?: Involvement;
}

export function LinkedAffairSelect({ value, onChange, excludeId, currentInvolvement }: Props) {
  const [selected, setSelected] = useState<AffairPickerResult | null>(null);

  const showSameInvolvementWarning = Boolean(
    selected && currentInvolvement && selected.involvement === currentInvolvement
  );
  const showChainWarning = Boolean(selected?.linkedAffairId);

  return (
    <div className="space-y-2">
      <AffairPicker
        value={value}
        onChange={(id, result) => {
          setSelected(result);
          onChange(id);
        }}
        onResolved={setSelected}
        excludeId={excludeId}
        label="Affaire liée (optionnel)"
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
