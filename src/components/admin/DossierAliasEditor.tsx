"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDossierAlias,
  deleteDossierAlias,
  publishDossierAlias,
  updateDossierAliasSources,
} from "@/app/admin/dossiers/[id]/alias-actions";
import { getDossierAliasSources, type DossierAliasSource } from "@/lib/legislation/alias";

type Alias = {
  id: string;
  label: string;
  kind: string;
  status: string;
  isPreferred: boolean;
  sources: unknown;
};

function SourcesFields({ sources = [] }: { sources?: DossierAliasSource[] }) {
  const [count, setCount] = useState(Math.max(1, sources.length));
  return (
    <fieldset className="space-y-2 md:col-span-2">
      <legend>Références attestant ce nom d’usage</legend>
      <p className="text-sm">
        Vérifiez une source institutionnelle ou plusieurs sources journalistiques indépendantes
        avant publication.
      </p>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-2">
          <label>
            URL de la source {i + 1}
            <input
              name="sourceUrl"
              type="url"
              required
              defaultValue={sources[i]?.url}
              className="mt-1 w-full min-h-11 rounded border p-2"
            />
          </label>
          <label>
            Nom de la source {i + 1}
            <input
              name="sourceLabel"
              required
              minLength={2}
              maxLength={200}
              defaultValue={sources[i]?.label}
              className="mt-1 w-full min-h-11 rounded border p-2"
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="min-h-11 px-2 underline"
        disabled={count >= 20}
        onClick={() => setCount(count + 1)}
      >
        Ajouter une référence
      </button>
      {count > 1 && (
        <button
          type="button"
          className="min-h-11 px-2 underline"
          onClick={() => setCount(count - 1)}
        >
          Retirer la dernière référence
        </button>
      )}
    </fieldset>
  );
}

function readSources(formData: FormData) {
  const labels = formData.getAll("sourceLabel");
  return formData
    .getAll("sourceUrl")
    .map((url, i) => ({ url: String(url), label: String(labels[i] || "") }));
}

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

  function runMutation(
    mutate: () => Promise<{ ok: true } | { ok: false; message: string }>,
    success: string
  ) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await mutate();
        setMessage(result.ok ? success : result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage("La modification a échoué. Veuillez réessayer.");
      }
    });
  }

  function addAlias(formData: FormData) {
    runMutation(
      () =>
        createDossierAlias({
          dossierId,
          label: String(formData.get("label") || ""),
          kind: String(formData.get("kind") || "COMMON"),
          sources: readSources(formData),
        }),
      "Alias ajouté en brouillon."
    );
  }

  return (
    <div className="space-y-4">
      {aliases.map((alias) => (
        <div key={alias.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
          <span className="font-medium">{alias.label}</span>
          <span className="text-xs text-muted-foreground">{alias.kind}</span>
          <span className="text-xs">{alias.status === "PUBLISHED" ? "Publié" : "Brouillon"}</span>
          {alias.isPreferred && <span className="text-xs font-medium">Principal</span>}
          <ul className="w-full">
            {getDossierAliasSources(alias.sources).map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${source.label} (source externe)`}
                  className="inline-flex min-h-11 items-center underline"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
          <details className="w-full">
            <summary className="min-h-11 cursor-pointer">Modifier les références</summary>
            <form
              action={(formData) => {
                runMutation(
                  () => updateDossierAliasSources(alias.id, readSources(formData)),
                  "Références enregistrées. Alias remis en brouillon."
                );
              }}
            >
              <SourcesFields sources={getDossierAliasSources(alias.sources)} />
              <button disabled={pending} className="min-h-11 px-2 underline">
                Enregistrer et remettre en brouillon
              </button>
            </form>
          </details>
          {alias.status !== "PUBLISHED" && (
            <button
              type="button"
              className="min-h-11 px-2 text-sm underline"
              disabled={pending}
              onClick={() => {
                runMutation(() => publishDossierAlias(alias.id, false), "Alias publié.");
              }}
            >
              Publier
            </button>
          )}
          {alias.status === "PUBLISHED" && !alias.isPreferred && (
            <button
              type="button"
              className="min-h-11 px-2 text-sm underline"
              disabled={pending}
              onClick={() => {
                runMutation(() => publishDossierAlias(alias.id, true), "Alias principal défini.");
              }}
            >
              Définir principal
            </button>
          )}
          <button
            type="button"
            className="min-h-11 px-2 text-sm text-destructive underline"
            disabled={pending}
            onClick={() => {
              runMutation(() => deleteDossierAlias(alias.id), "Alias supprimé.");
            }}
          >
            Supprimer
          </button>
        </div>
      ))}
      <form action={addAlias} className="grid gap-2 md:grid-cols-2">
        <label className="text-sm">
          Nom d’usage
          <input
            name="label"
            required
            minLength={3}
            maxLength={160}
            className="mt-1 min-h-11 w-full rounded border p-2"
          />
        </label>
        <label className="text-sm">
          Type
          <select name="kind" className="mt-1 min-h-11 w-full rounded border p-2">
            <option value="COMMON">Courant</option>
            <option value="MEDIA">Médiatique</option>
            <option value="OFFICIAL_SHORT">Court officiel</option>
            <option value="HISTORICAL">Historique</option>
          </select>
        </label>
        <SourcesFields />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded bg-primary px-3 py-2 text-primary-foreground md:col-span-2"
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
