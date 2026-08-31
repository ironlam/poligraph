"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { MeasureReaderGuideSourceKind, PublicationStatus } from "@/generated/prisma";
import {
  publishReaderGuideAction,
  saveReaderGuideDraftAction,
  type ActionResult,
} from "../actions";

type Guide = {
  id: string;
  slug: string;
  label: string;
  definition: string;
  aliases: string[];
  sourceKind: MeasureReaderGuideSourceKind;
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
  sourceRevisionId: string | null;
  publicationStatus: PublicationStatus;
};

const EMPTY = {
  slug: "",
  label: "",
  definition: "",
  aliases: "",
  sourceKind: "OFFICIAL_INSTITUTION" as MeasureReaderGuideSourceKind,
  sourceUrl: "",
  sourceLabel: "",
  sourcePublisher: "",
  sourceRevisionId: "",
};

export function ReaderGuideAdmin({ guides }: { guides: Guide[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, success: string): void {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setMessage(result.message);
      setMessage(success);
      setEditingId(undefined);
      setForm(EMPTY);
      router.refresh();
    });
  }

  function edit(guide: Guide): void {
    setEditingId(guide.id);
    setForm({
      slug: guide.slug,
      label: guide.label,
      definition: guide.definition,
      aliases: guide.aliases.join("\n"),
      sourceKind: guide.sourceKind,
      sourceUrl: guide.sourceUrl,
      sourceLabel: guide.sourceLabel,
      sourcePublisher: guide.sourcePublisher,
      sourceRevisionId: guide.sourceRevisionId ?? "",
    });
    document.getElementById("reader-guide-form")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="rounded border border-border bg-muted/40 p-3 text-sm"
        >
          {message}
        </p>
      )}
      <section aria-labelledby="reader-guide-list-title">
        <h2 id="reader-guide-list-title" className="text-lg font-bold">
          Référentiel
        </h2>
        <ul className="mt-3 space-y-3">
          {guides.map((guide) => (
            <li key={guide.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="font-bold">{guide.label}</p>
                  <p className="mt-1 text-sm leading-relaxed">{guide.definition}</p>
                  <a
                    href={guide.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary underline"
                  >
                    {guide.sourcePublisher}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Statut : {guide.publicationStatus === "PUBLISHED" ? "publié" : "brouillon"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {guide.publicationStatus === "DRAFT" && (
                    <>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={pending}
                        onClick={() => edit(guide)}
                      >
                        Modifier
                      </Button>
                      <Button
                        className="min-h-11"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => publishReaderGuideAction({ guideId: guide.id }),
                            "Repère publié."
                          )
                        }
                      >
                        Publier
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="reader-guide-form"
        aria-labelledby="reader-guide-form-title"
        className="rounded-lg border border-border p-4"
      >
        <h2 id="reader-guide-form-title" className="text-lg font-bold">
          {editingId ? "Modifier le brouillon" : "Nouveau repère"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La source doit être une page institutionnelle officielle ou une source déjà rattachée à
          une révision de mesure. La publication reste une action distincte.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                saveReaderGuideDraftAction({
                  ...(editingId ? { id: editingId } : {}),
                  ...form,
                  sourceRevisionId:
                    form.sourceKind === "PROGRAM_SOURCE" ? form.sourceRevisionId : null,
                  aliases: form.aliases
                    .split("\n")
                    .map((alias) => alias.trim())
                    .filter(Boolean),
                }),
              "Brouillon enregistré."
            );
          }}
        >
          <label>
            <span className="text-sm font-medium">Nature de la source</span>
            <select
              value={form.sourceKind}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sourceKind: event.target.value as MeasureReaderGuideSourceKind,
                }))
              }
              className="mt-1 min-h-11 w-full rounded border border-border bg-background px-3"
            >
              <option value="OFFICIAL_INSTITUTION">Institution officielle</option>
              <option value="PROGRAM_SOURCE">Source du programme</option>
            </select>
          </label>
          {form.sourceKind === "PROGRAM_SOURCE" && (
            <label>
              <span className="text-sm font-medium">Identifiant de la révision source</span>
              <input
                required
                value={form.sourceRevisionId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sourceRevisionId: event.target.value,
                  }))
                }
                className="mt-1 min-h-11 w-full rounded border border-border bg-background px-3"
                type="text"
                aria-describedby="reader-guide-source-revision-help"
              />
              <span
                id="reader-guide-source-revision-help"
                className="mt-1 block text-xs text-muted-foreground"
              >
                Identifiant visible dans l’URL de la révision depuis la fiche d’administration.
              </span>
            </label>
          )}
          {(["slug", "label", "sourcePublisher", "sourceLabel", "sourceUrl"] as const).map(
            (name) => (
              <label key={name} className={name === "sourceUrl" ? "sm:col-span-2" : ""}>
                <span className="text-sm font-medium">
                  {
                    {
                      slug: "Slug",
                      label: "Libellé",
                      sourcePublisher: "Éditeur de la source",
                      sourceLabel: "Titre de la source",
                      sourceUrl: "URL de la source",
                    }[name]
                  }
                </span>
                <input
                  required
                  value={form[name]}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [name]: event.target.value }))
                  }
                  className="mt-1 min-h-11 w-full rounded border border-border bg-background px-3"
                  type={name === "sourceUrl" ? "url" : "text"}
                />
              </label>
            )
          )}
          <label className="sm:col-span-2">
            <span className="text-sm font-medium">Définition factuelle</span>
            <textarea
              required
              rows={5}
              value={form.definition}
              onChange={(event) =>
                setForm((current) => ({ ...current, definition: event.target.value }))
              }
              className="mt-1 w-full rounded border border-border bg-background p-3"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-medium">Alias, un par ligne</span>
            <textarea
              rows={4}
              value={form.aliases}
              onChange={(event) =>
                setForm((current) => ({ ...current, aliases: event.target.value }))
              }
              className="mt-1 w-full rounded border border-border bg-background p-3"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer le brouillon"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setEditingId(undefined);
                  setForm(EMPTY);
                }}
              >
                Annuler
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
