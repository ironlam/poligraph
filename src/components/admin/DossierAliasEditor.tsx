"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDossierAlias,
  deleteDossierAlias,
  publishDossierAlias,
} from "@/app/admin/dossiers/[id]/alias-actions";

type Alias = {
  id: string;
  label: string;
  kind: string;
  status: string;
  isPreferred: boolean;
};

export function DossierAliasEditor({
  dossierId,
  aliases,
}: {
  dossierId: string;
  aliases: Alias[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function addAlias(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await createDossierAlias({
        dossierId,
        label: String(formData.get("label") || ""),
        kind: String(formData.get("kind") || "COMMON") as
          | "MEDIA"
          | "COMMON"
          | "OFFICIAL_SHORT"
          | "HISTORICAL",
        sourceUrl: String(formData.get("sourceUrl") || ""),
        sourceLabel: String(formData.get("sourceLabel") || ""),
      });
      setMessage(result.ok ? "Alias ajouté en brouillon." : result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {aliases.map((alias) => (
        <div key={alias.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
          <span className="font-medium">{alias.label}</span>
          <span className="text-xs text-muted-foreground">{alias.kind}</span>
          <span className="text-xs">{alias.status === "PUBLISHED" ? "Publié" : "Brouillon"}</span>
          {alias.isPreferred && <span className="text-xs font-medium">Principal</span>}
          {alias.status !== "PUBLISHED" && (
            <button
              type="button"
              className="text-sm underline"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await publishDossierAlias(alias.id, false);
                  setMessage(result.ok ? "Alias publié." : result.message);
                  if (result.ok) router.refresh();
                });
              }}
            >
              Publier
            </button>
          )}
          {alias.status === "PUBLISHED" && !alias.isPreferred && (
            <button
              type="button"
              className="text-sm underline"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await publishDossierAlias(alias.id, true);
                  setMessage(result.ok ? "Alias principal défini." : result.message);
                  if (result.ok) router.refresh();
                });
              }}
            >
              Définir principal
            </button>
          )}
          <button
            type="button"
            className="text-sm text-destructive underline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await deleteDossierAlias(alias.id);
                setMessage(result.ok ? "Alias supprimé." : result.message);
                if (result.ok) router.refresh();
              });
            }}
          >
            Supprimer
          </button>
        </div>
      ))}
      <form action={addAlias} className="grid gap-2 md:grid-cols-2">
        <label className="text-sm">
          Nom d’usage
          <input name="label" required minLength={3} className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="text-sm">
          Type
          <select name="kind" className="mt-1 w-full rounded border p-2">
            <option value="COMMON">Courant</option>
            <option value="MEDIA">Médiatique</option>
            <option value="OFFICIAL_SHORT">Court officiel</option>
            <option value="HISTORICAL">Historique</option>
          </select>
        </label>
        <label className="text-sm">
          URL de source
          <input name="sourceUrl" type="url" required className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="text-sm">
          Nom de la source
          <input name="sourceLabel" required className="mt-1 w-full rounded border p-2" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-primary px-3 py-2 text-primary-foreground md:col-span-2"
        >
          Ajouter le nom d’usage
        </button>
      </form>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
