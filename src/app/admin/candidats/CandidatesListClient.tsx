"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CandidacyStatus, PublicationStatus } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_STYLES } from "@/config/labels";
import { formatDate } from "@/lib/utils";
import type { CandidacyMeasureReadiness } from "@/lib/data/measures";
import {
  regenerateCandidateSynthesisAction,
  setCandidacyPublicationAction,
  setCandidacyStatusAction,
  setProgramEditionPublicationAction,
} from "./actions";

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

/**
 * What the fiche does with the stored synthesis, decided server-side by the same predicate the
 * public read applies. Three states and not a date, because a date is not readable as a verdict:
 * "7 août" tells a moderator nothing until they also know when the measures were published.
 */
export type SynthesisState = "MISSING" | "CONTRADICTED" | "CURRENT";

const SYNTHESIS_LABELS: Record<SynthesisState, string> = {
  MISSING: "Absente",
  CONTRADICTED: "Démentie",
  CURRENT: "À jour",
};

const SYNTHESIS_STYLES: Record<SynthesisState, string> = {
  MISSING: "",
  CONTRADICTED: "border-amber-400 text-amber-900 dark:border-amber-600 dark:text-amber-100",
  CURRENT: "border-emerald-400 text-emerald-900 dark:border-emerald-600 dark:text-emerald-100",
};

export type CandidateRowView = {
  candidacyId: string;
  candidateName: string;
  politicianId: string | null;
  politicianSlug: string | null;
  politicianPublicationStatus: PublicationStatus | null;
  partyLabel: string | null;
  status: CandidacyStatus | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  /** Status, source URL and source label all present: the condition the public fiche imposes. */
  sourced: boolean;
  /** Null when the candidacy carries no `CandidacyPresidential` row yet. */
  presidentialId: string | null;
  publicationStatus: PublicationStatus | null;
  slogan: string | null;
  rank: number | null;
  readiness: CandidacyMeasureReadiness;
  synthesisState: SynthesisState;
  synthesisGeneratedAt: Date | null;
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
  const [statusDrafts, setStatusDrafts] = useState(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.candidacyId,
        {
          status: row.status ?? "",
          sourceUrl: row.sourceUrl ?? "",
          sourceLabel: row.sourceLabel ?? "",
        },
      ])
    )
  );

  const held = rows.filter(isHoldingBackMeasures);
  const heldMeasureCount = held.reduce((total, row) => total + row.readiness.measureCount, 0);
  const contradicted = rows.filter((row) => row.synthesisState === "CONTRADICTED");
  const identityBlocked = rows.filter(
    (row) =>
      row.publicationStatus === "PUBLISHED" && row.politicianPublicationStatus !== "PUBLISHED"
  );

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

      {identityBlocked.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <p className="font-semibold">
            {identityBlocked.length === 1
              ? "1 candidature publiée reste invisible"
              : `${identityBlocked.length} candidatures publiées restent invisibles`}
          </p>
          <p className="mt-1">
            La personnalité liée doit aussi être publiée. Le moteur de recherche et les pages
            publiques la masquent actuellement :{" "}
            {identityBlocked.map((row) => row.candidateName).join(", ")}.
          </p>
        </div>
      )}

      {/* The state the fiche is actually in, which nothing on this screen used to say. A moderator
          publishing measures has no reason to suspect that a text generated weeks earlier now
          denies them, and the public page shows no summary at all until it is regenerated. */}
      {contradicted.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-semibold">
            {contradicted.length === 1
              ? "1 synthèse démentie par les mesures publiées depuis"
              : `${contradicted.length} synthèses démenties par les mesures publiées depuis`}
          </p>
          <p className="mt-1">
            Écrites quand la candidature n&apos;avait aucune mesure, elles affirment un programme
            vide. La fiche publique n&apos;affiche donc aucun résumé tant qu&apos;elles ne sont pas
            régénérées : {contradicted.map((row) => row.candidateName).join(", ")}.
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
              <th className="text-left px-3 py-2">Synthèse</th>
              <th className="text-left px-3 py-2">Slogan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const publicationKey = `publication:${row.candidacyId}`;
              const statusKey = `statut:${row.candidacyId}`;
              const synthesisKey = `synthese:${row.candidacyId}`;
              const published = row.publicationStatus === "PUBLISHED";
              const locked = busy !== null || pending;
              const statusDraft = statusDrafts[row.candidacyId] ?? {
                status: row.status ?? "",
                sourceUrl: row.sourceUrl ?? "",
                sourceLabel: row.sourceLabel ?? "",
              };
              const updateStatusDraft = (patch: Partial<typeof statusDraft>) =>
                setStatusDrafts((current) => ({
                  ...current,
                  [row.candidacyId]: { ...statusDraft, ...patch },
                }));
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
                    {row.politicianId && row.politicianPublicationStatus !== "PUBLISHED" && (
                      <Link
                        href={`/admin/politiques/${row.politicianId}`}
                        className="mt-2 block text-xs font-semibold text-primary underline underline-offset-2"
                      >
                        Publier la personnalité
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.partyLabel ?? "Sans parti"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <label className="sr-only" htmlFor={statusKey}>
                      Statut de {row.candidateName}
                    </label>
                    <div className="flex min-w-64 flex-col gap-2">
                      <select
                        id={statusKey}
                        value={statusDraft.status}
                        onChange={(event) => updateStatusDraft({ status: event.target.value })}
                        disabled={locked}
                        className="min-h-11 rounded border bg-background px-2 text-sm md:min-h-[36px]"
                        aria-label={`Statut de ${row.candidateName}`}
                      >
                        {!row.status && <option value="">Statut non renseigné</option>}
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="url"
                        value={statusDraft.sourceUrl}
                        onChange={(event) => updateStatusDraft({ sourceUrl: event.target.value })}
                        disabled={locked}
                        className="min-h-11 rounded border bg-background px-2 text-sm md:min-h-[36px]"
                        aria-label={`URL source du statut de ${row.candidateName}`}
                        placeholder="https://site-officiel.fr/annonce"
                      />
                      <input
                        type="text"
                        value={statusDraft.sourceLabel}
                        onChange={(event) => updateStatusDraft({ sourceLabel: event.target.value })}
                        disabled={locked}
                        className="min-h-11 rounded border bg-background px-2 text-sm md:min-h-[36px]"
                        aria-label={`Libellé source du statut de ${row.candidateName}`}
                        placeholder="Annonce officielle, date"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          runAction(statusKey, () =>
                            setCandidacyStatusAction({
                              candidacyId: row.candidacyId,
                              status: statusDraft.status as CandidacyStatus,
                              sourceUrl: statusDraft.sourceUrl.trim(),
                              sourceLabel: statusDraft.sourceLabel.trim(),
                            })
                          )
                        }
                        disabled={
                          locked ||
                          !statusDraft.status ||
                          !statusDraft.sourceUrl.trim() ||
                          !statusDraft.sourceLabel.trim()
                        }
                        className="inline-flex min-h-11 items-center justify-center rounded border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 md:min-h-[36px]"
                      >
                        {busy === statusKey ? "Enregistrement..." : "Enregistrer le statut"}
                      </button>
                    </div>
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
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1.5">
                      <Badge variant="outline" className={SYNTHESIS_STYLES[row.synthesisState]}>
                        {SYNTHESIS_LABELS[row.synthesisState]}
                      </Badge>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(synthesisKey, () =>
                            regenerateCandidateSynthesisAction({ candidacyId: row.candidacyId })
                          )
                        }
                        disabled={locked || row.status !== "DECLARE" || !row.presidentialId}
                        title={
                          row.status !== "DECLARE"
                            ? "Seule une candidature déclarée porte une synthèse"
                            : !row.presidentialId
                              ? "Publier la fiche crée les métadonnées où la synthèse est écrite"
                              : undefined
                        }
                        aria-label={`Régénérer la synthèse de ${row.candidateName}`}
                        className="inline-flex min-h-11 items-center justify-center rounded border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 md:min-h-[36px]"
                      >
                        {busy === synthesisKey ? "Génération..." : "Régénérer"}
                      </button>
                      {row.synthesisGeneratedAt !== null && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(row.synthesisGeneratedAt)}
                        </span>
                      )}
                      {row.politicianSlug && (
                        <Link
                          href={`/admin/candidats/${row.politicianSlug}/syntheses-thematiques`}
                          className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline md:min-h-[36px]"
                        >
                          Gérer les synthèses par thème
                        </Link>
                      )}
                    </div>
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
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
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
