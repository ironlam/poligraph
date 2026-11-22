"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPES = { COM: "Commune", DEP: "Département", REG: "Région" } as const;

/** Territory, publication and rejection of one draft notice. API errors show in the form. */
export function RapportCrcActions({
  id,
  territoryType,
  territoryCode,
}: {
  id: string;
  territoryType: keyof typeof TYPES;
  territoryCode: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(event.currentTarget);
    const champ = (name: string) => String(data.get(name) ?? "").trim();
    const action = submitter?.value;
    const body =
      action === "RATTACHER"
        ? { action, territoryType: champ("territoryType"), territoryCode: champ("territoryCode") }
        : action === "PUBLIER"
          ? { action, reviewedBy: champ("reviewedBy") }
          : { action, reason: champ("reason") };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/territoires/rapports-crc/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`type-${id}`}>Type</Label>
          <select
            id={`type-${id}`}
            name="territoryType"
            defaultValue={territoryType}
            className="h-11 rounded-md border bg-background px-2 text-sm"
          >
            {Object.entries(TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`code-${id}`}>Code INSEE</Label>
          <Input
            id={`code-${id}`}
            name="territoryCode"
            defaultValue={territoryCode ?? ""}
            maxLength={5}
            className="h-11 w-28"
          />
        </div>
        <Button type="submit" value="RATTACHER" disabled={busy} variant="outline" className="h-11">
          Rattacher
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`reviewedBy-${id}`}>Relu par (nom)</Label>
          <Input id={`reviewedBy-${id}`} name="reviewedBy" maxLength={100} className="h-11" />
        </div>
        <Button type="submit" value="PUBLIER" disabled={busy || !territoryCode} className="h-11">
          Publier
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`reason-${id}`}>Motif du rejet</Label>
          <Input id={`reason-${id}`} name="reason" maxLength={500} className="h-11" />
        </div>
        <Button type="submit" value="REJETER" disabled={busy} variant="outline" className="h-11">
          Rejeter
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
