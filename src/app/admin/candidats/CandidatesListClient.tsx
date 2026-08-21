"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CandidacyStatus, PublicationStatus } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_STYLES } from "@/config/labels";
import type { CandidacyMeasureReadiness } from "@/lib/data/measures";
import { setCandidacyPublicationAction, setProgramEditionPublicationAction } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  DECLARE: "Déclaré",
  PRESSENTI: "Pressenti",
  ENVISAGE: "Envisagé",
  RETIRE: "Retiré",
};

export type ProgramEditionView = {
  id: string;
  label: string;
  version: number;
  publicationStatus: PublicationStatus;
};

export type CandidateRowView = {
  candidacyId: string;
  candidateName: string;
  politicianSlug: string | null;
  partyLabel: string | null;
  status: CandidacyStatus | null;
  /** Status, source URL and source label all present: the condition the public fiche imposes. */
  sourced: boolean;
  /** Null when the candidacy carries no `CandidacyPresidential` row yet. */
  presidentialId: string | null;
  publicationStatus: PublicationStatus | null;
  slogan: string | null;
  rank: number | null;
  readiness: CandidacyMeasureReadiness;
  editions: ProgramEditionView[];
};

/** A candidacy whose measures are ready to be read and whose extension still hides them. */
function isHoldingBackMeasures(row: CandidateRowView): boolean {
  return row.readiness.measureCount > 0 && row.publicationStatus !== "PUBLISHED";
}

export function CandidatesListClient({ rows }: { rows: CandidateRowView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const held = rows.filter(isHoldingBackMeasures);
  const heldMeasureCount = held.reduce((total, row) => total + row.readiness.measureCount, 0);

  async function patchPresidential(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/candidats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      setError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  function runAction(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "L'opération a échoué.");
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* The signal that was missing entirely. Once every measure of a candidate is published, the
          moderation queue empties and nothing else said that the candidacy itself still hid them. */}
      {held.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-semibold">
            {held.length === 1
              ? "1 candidature retient des mesures prêtes"
              : `${held.length} candidatures retiennent des mesures prêtes`}
          </p>
          <p className="mt-1">
            {heldMeasureCount} mesures relues, publiées et sourcées ne sortent sur aucune surface
            publique tant que la fiche candidature reste en brouillon :{" "}
            {held.map((row) => row.candidateName).join(", ")}.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2">Rang</th>
              <th className="text-left px-3 py-2">Candidat</th>
              <th className="text-left px-3 py-2">Parti</th>
              <th className="text-left px-3 py-2">Statut</th>
              <th className="text-left px-3 py-2">Mesures prêtes</th>
              <th className="text-left px-3 py-2">Fiche publique</th>
              <th className="text-left px-3 py-2">Programme</th>
              <th className="text-left px-3 py-2">Slogan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const publicationKey = `publication:${row.candidacyId}`;
              const published = row.publicationStatus === "PUBLISHED";
              const locked = busy !== null || pending;
              return (
                <tr key={row.candidacyId} className="border-t align-top">
                  <td className="px-3 py-2 w-12">
                    <input
                      type="number"
                      min={0}
                      defaultValue={row.rank ?? ""}
                      onBlur={(e) => {
                        const value = e.target.value ? Number(e.target.value) : null;
                        if (row.presidentialId)
                          patchPresidential(row.presidentialId, { rank: value });
                      }}
                      className="w-12 rounded border px-1 py-0.5 text-sm dark:bg-slate-800"
                      aria-label={`Rang de ${row.candidateName}`}
                      disabled={locked || !row.presidentialId}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.politicianSlug ? (
                      <Link
                        href={`/admin/candidats/${row.politicianSlug}`}
                        className="text-primary hover:underline"
                      >
                        {row.candidateName}
                      </Link>
                    ) : (
                      <span>{row.candidateName}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.partyLabel ?? "Sans parti"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {STATUS_LABELS[row.status ?? ""] ?? "Statut non renseigné"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.readiness.measureCount === 0 ? (
                      <span className="text-muted-foreground">Aucune</span>
                    ) : (
                      <>
                        <span className="font-semibold">{row.readiness.measureCount}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.readiness.themesCoveredCount} thèmes ·{" "}
                          {row.readiness.primarySourceMeasureCount} sourcées 1re main
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          row.publicationStatus
                            ? PUBLICATION_STATUS_STYLES[row.publicationStatus]
                            : ""
                        }
                      >
                        {row.publicationStatus
                          ? PUBLICATION_STATUS_LABELS[row.publicationStatus]
                          : "Métadonnées absentes"}
                      </Badge>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(publicationKey, () =>
                            setCandidacyPublicationAction({
                              candidacyId: row.candidacyId,
                              status: published ? "DRAFT" : "PUBLISHED",
                            })
                          )
                        }
                        disabled={locked || (!published && !row.sourced)}
                        title={
                          !published && !row.sourced
                            ? "Renseigner le statut et la source de la candidature avant publication"
                            : undefined
                        }
                        className="inline-flex min-h-11 items-center justify-center rounded border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 md:min-h-[36px]"
                      >
                        {busy === publicationKey
                          ? "En cours..."
                          : published
                            ? "Dépublier"
                            : "Publier la fiche"}
                      </button>
                      {!published && !row.sourced && (
                        <span className="text-xs text-muted-foreground">
                          Statut et source obligatoires
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    {row.editions.length === 0 ? (
                      <span className="text-muted-foreground">Aucune édition</span>
                    ) : (
                      <ul className="space-y-2">
                        {row.editions.map((edition) => {
                          const editionKey = `edition:${edition.id}`;
                          const editionPublished = edition.publicationStatus === "PUBLISHED";
                          return (
                            <li key={edition.id} className="space-y-1">
                              <p className="line-clamp-2">
                                {edition.label}{" "}
                                <span className="text-muted-foreground">(v{edition.version})</span>
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={PUBLICATION_STATUS_STYLES[edition.publicationStatus]}
                                >
                                  {PUBLICATION_STATUS_LABELS[edition.publicationStatus]}
                                </Badge>
                                <button
                                  type="button"
                                  onClick={() =>
                                    runAction(editionKey, () =>
                                      setProgramEditionPublicationAction({
                                        programEditionId: edition.id,
                                        status: editionPublished ? "DRAFT" : "PUBLISHED",
                                      })
                                    )
                                  }
                                  disabled={locked}
                                  aria-label={`${editionPublished ? "Dépublier" : "Publier"} l'édition ${edition.label} de ${row.candidateName}`}
                                  className="inline-flex min-h-11 items-center justify-center rounded border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 md:min-h-[36px]"
                                >
                                  {busy === editionKey
                                    ? "En cours..."
                                    : editionPublished
                                      ? "Dépublier"
                                      : "Publier"}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <input
                      type="text"
                      defaultValue={row.slogan ?? ""}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (row.presidentialId)
                          patchPresidential(row.presidentialId, { slogan: value });
                      }}
                      className="w-full rounded border px-2 py-0.5 text-sm dark:bg-slate-800"
                      aria-label={`Slogan de ${row.candidateName}`}
                      disabled={locked || !row.presidentialId}
                      placeholder={
                        row.presidentialId ? "ex : Vous protéger" : "Métadonnées absentes"
                      }
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Aucune candidature enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
