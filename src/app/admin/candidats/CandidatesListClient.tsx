"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CandidacyStatus, PublicationStatus } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  OFFICIAL: "Officielle",
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
  synthesis: string | null;
  synthesisGeneratedAt: Date | null;
  editions: ProgramEditionView[];
};

/** A candidacy whose measures are ready to be read and whose extension still hides them. */
function isHoldingBackMeasures(row: CandidateRowView): boolean {
  return row.readiness.measureCount > 0 && row.publicationStatus !== "PUBLISHED";
}

/**
 * Why a candidacy needs a moderator now, in the words the summary line shows. The same signals as
 * the banners above the list, plus a missing source, so the "to do" filter and the banners never
 * disagree.
 */
export function attentionReasons(row: CandidateRowView): string[] {
  const reasons: string[] = [];
  if (!row.sourced) reasons.push("source manquante");
  if (isHoldingBackMeasures(row)) reasons.push("mesures retenues");
  if (row.publicationStatus === "PUBLISHED" && row.politicianPublicationStatus !== "PUBLISHED") {
    reasons.push("personnalité masquée");
  }
  if (row.synthesisState === "CONTRADICTED") reasons.push("synthèse démentie");
  return reasons;
}

function ficheLabel(status: PublicationStatus | null): string {
  if (status === "PUBLISHED") return "Fiche publiée";
  if (status === "DRAFT") return "Fiche en brouillon";
  if (status) return `Fiche ${PUBLICATION_STATUS_LABELS[status].toLowerCase()}`;
  return "Fiche sans métadonnées";
}

export function CandidatesListClient({ rows }: { rows: CandidateRowView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [synthesisEditor, setSynthesisEditor] = useState<{
    candidacyId: string;
    candidateName: string;
    text: string;
    reviewWarning?: string;
  } | null>(null);
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

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [toTreatOnly, setToTreatOnly] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const visibleRows = rows.filter(
    (row) =>
      (!normalizedQuery ||
        `${row.candidateName} ${row.partyLabel ?? ""}`
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery)) &&
      (!statusFilter || row.status === statusFilter) &&
      (!toTreatOnly || attentionReasons(row).length > 0)
  );

  const setOpen = (candidacyId: string, open: boolean) =>
    setOpenIds((current) => {
      if (current.has(candidacyId) === open) return current;
      const next = new Set(current);
      if (open) next.add(candidacyId);
      else next.delete(candidacyId);
      return next;
    });

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

  async function generateSynthesisProposal(row: CandidateRowView) {
    const key = `synthese:${row.candidacyId}`;
    setBusy(key);
    setError(null);
    try {
      const result = await regenerateCandidateSynthesisAction({ candidacyId: row.candidacyId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSynthesisEditor({
        candidacyId: row.candidacyId,
        candidateName: row.candidateName,
        text: result.text ?? "",
        reviewWarning: result.reviewWarning,
      });
    } catch (err) {
      setError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveSynthesis() {
    if (!synthesisEditor) return;
    const key = `synthese-save:${synthesisEditor.candidacyId}`;
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/candidats/${synthesisEditor.candidacyId}/synthesis`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ synthesis: synthesisEditor.text }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "L'enregistrement a échoué.");
      }
      setSynthesisEditor(null);
      router.refresh();
    } catch (err) {
      setError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
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

      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="sr-only" htmlFor="filtre-candidats">
          Rechercher une candidature
        </label>
        <input
          id="filtre-candidats"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un nom ou un parti"
          className="min-h-11 flex-1 rounded-md border bg-background px-3 text-sm sm:min-w-64"
        />
        <label className="sr-only" htmlFor="filtre-statut">
          Filtrer par statut
        </label>
        <select
          id="filtre-statut"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="min-h-11 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toTreatOnly}
            onChange={(event) => setToTreatOnly(event.target.checked)}
            className="h-5 w-5"
          />
          À traiter seulement
        </label>
        <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
          {visibleRows.length === rows.length
            ? `${rows.length} candidatures`
            : `${visibleRows.length} sur ${rows.length} candidatures`}
        </p>
      </div>

      <div className="space-y-2">
        {visibleRows.map((row) => {
          const publicationKey = `publication:${row.candidacyId}`;
          const statusKey = `statut:${row.candidacyId}`;
          const synthesisKey = `synthese:${row.candidacyId}`;
          const saveKey = `synthese-save:${row.candidacyId}`;
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
          const editorOpen = synthesisEditor?.candidacyId === row.candidacyId;

          const reasons = attentionReasons(row);

          return (
            <details
              key={row.candidacyId}
              open={openIds.has(row.candidacyId) || editorOpen}
              onToggle={(event) => setOpen(row.candidacyId, event.currentTarget.open)}
              className="group rounded-xl border bg-card shadow-sm"
            >
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-open:rotate-90"
                >
                  ▸
                </span>
                <span className="min-w-40 flex-1">
                  <span className="font-display text-base font-bold">{row.candidateName}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {row.partyLabel ?? "Sans parti"} ·{" "}
                    {STATUS_LABELS[row.status ?? ""] ?? "Statut non renseigné"}
                  </span>
                </span>
                <Badge
                  variant="outline"
                  className={
                    row.publicationStatus ? PUBLICATION_STATUS_STYLES[row.publicationStatus] : ""
                  }
                >
                  {ficheLabel(row.publicationStatus)}
                </Badge>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {row.readiness.measureCount} mesure{row.readiness.measureCount > 1 ? "s" : ""}
                </span>
                <span className="text-sm text-muted-foreground">
                  Synthèse : {SYNTHESIS_LABELS[row.synthesisState].toLowerCase()}
                </span>
                {reasons.length > 0 && (
                  <span className="rounded border border-amber-400 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-600 dark:text-amber-100">
                    À traiter : {reasons.join(", ")}
                  </span>
                )}
              </summary>

              <div className="border-t px-4 pb-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  {row.politicianSlug && (
                    <Link
                      href={`/admin/candidats/${row.politicianSlug}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary underline underline-offset-2"
                    >
                      Page du candidat
                    </Link>
                  )}
                  {row.politicianSlug && (
                    <Link
                      href={`/elections/presidentielle-2027/candidats/${row.politicianSlug}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary underline underline-offset-2"
                    >
                      Voir la fiche publique
                    </Link>
                  )}
                </div>

                <div className="grid gap-6 py-5 xl:grid-cols-[minmax(18rem,1.15fr)_minmax(16rem,0.9fr)_minmax(18rem,1fr)]">
                  <section aria-labelledby={`${statusKey}-titre`} className="space-y-3">
                    <div>
                      <h3 id={`${statusKey}-titre`} className="font-semibold">
                        Statut et source
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        La source justifie le statut public de la candidature.
                      </p>
                    </div>
                    <label className="sr-only" htmlFor={statusKey}>
                      Statut de {row.candidateName}
                    </label>
                    <select
                      id={statusKey}
                      value={statusDraft.status}
                      onChange={(event) => updateStatusDraft({ status: event.target.value })}
                      disabled={locked}
                      className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
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
                      className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                      aria-label={`URL source du statut de ${row.candidateName}`}
                      placeholder="https://site-officiel.fr/annonce"
                    />
                    <input
                      type="text"
                      value={statusDraft.sourceLabel}
                      onChange={(event) => updateStatusDraft({ sourceLabel: event.target.value })}
                      disabled={locked}
                      className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
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
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                    >
                      {busy === statusKey ? "Enregistrement..." : "Enregistrer le statut"}
                    </button>
                  </section>

                  <section aria-labelledby={`${publicationKey}-titre`} className="space-y-3">
                    <div>
                      <h3 id={`${publicationKey}-titre`} className="font-semibold">
                        Publication et programme
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {row.readiness.measureCount === 0
                          ? "Aucune mesure prête"
                          : `${row.readiness.measureCount} mesures · ${row.readiness.themesCoveredCount} thèmes · ${row.readiness.primarySourceMeasureCount} sourcées en première main`}
                      </p>
                    </div>
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
                          ? "Renseigner le statut et la source avant publication"
                          : undefined
                      }
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                    >
                      {busy === publicationKey
                        ? "En cours..."
                        : published
                          ? "Dépublier la fiche"
                          : "Publier la fiche"}
                    </button>
                    {!published && !row.sourced && (
                      <p className="text-xs text-muted-foreground">Statut et source obligatoires</p>
                    )}
                    {row.editions.length === 0 ? (
                      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                        Aucune édition de programme.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {row.editions.map((edition) => {
                          const editionKey = `edition:${edition.id}`;
                          const editionPublished = edition.publicationStatus === "PUBLISHED";
                          return (
                            <li key={edition.id} className="rounded-md border p-3 text-sm">
                              <p className="font-medium">
                                {edition.label}{" "}
                                <span className="text-muted-foreground">(v{edition.version})</span>
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
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
                                  className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-semibold text-primary underline underline-offset-2 disabled:opacity-50"
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
                  </section>

                  <section aria-labelledby={`${synthesisKey}-titre`} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id={`${synthesisKey}-titre`} className="font-semibold">
                        Synthèse générale
                      </h3>
                      <Badge variant="outline" className={SYNTHESIS_STYLES[row.synthesisState]}>
                        {SYNTHESIS_LABELS[row.synthesisState]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      La génération crée une proposition. Elle ne remplace le texte public qu’après
                      ton enregistrement.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                      <button
                        type="button"
                        onClick={() => generateSynthesisProposal(row)}
                        disabled={
                          locked ||
                          !["DECLARE", "OFFICIAL"].includes(row.status ?? "") ||
                          !row.presidentialId
                        }
                        title={
                          !["DECLARE", "OFFICIAL"].includes(row.status ?? "")
                            ? "Seule une candidature déclarée ou officielle porte une synthèse"
                            : !row.presidentialId
                              ? "Publier la fiche crée les métadonnées nécessaires"
                              : undefined
                        }
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {busy === synthesisKey ? "Génération..." : "Générer une proposition"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSynthesisEditor({
                            candidacyId: row.candidacyId,
                            candidateName: row.candidateName,
                            text: row.synthesis ?? "",
                          })
                        }
                        disabled={locked || !row.synthesis}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                      >
                        Modifier le texte
                      </button>
                    </div>
                    {row.synthesisGeneratedAt !== null && (
                      <p className="text-xs text-muted-foreground">
                        Dernière version : {formatDate(row.synthesisGeneratedAt)}
                      </p>
                    )}
                    {row.politicianSlug && (
                      <Link
                        href={`/admin/candidats/${row.politicianSlug}/syntheses-thematiques`}
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2"
                      >
                        Gérer les synthèses par thème
                      </Link>
                    )}
                  </section>
                </div>

                {editorOpen && synthesisEditor && (
                  <section
                    aria-labelledby={`editeur-${row.candidacyId}`}
                    className="mb-5 rounded-lg border border-primary/30 bg-muted/40 p-4"
                  >
                    <h3
                      id={`editeur-${row.candidacyId}`}
                      className="font-display text-lg font-bold"
                    >
                      Relire la synthèse de {synthesisEditor.candidateName}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Corrige librement la proposition. Rien n’est publié avant « Enregistrer la
                      synthèse ».
                    </p>
                    {synthesisEditor.reviewWarning && (
                      <p
                        role="alert"
                        className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                      >
                        {synthesisEditor.reviewWarning}
                      </p>
                    )}
                    <label
                      htmlFor={`texte-synthese-${row.candidacyId}`}
                      className="mt-4 block text-sm font-semibold"
                    >
                      Texte public
                    </label>
                    <Textarea
                      id={`texte-synthese-${row.candidacyId}`}
                      value={synthesisEditor.text}
                      onChange={(event) =>
                        setSynthesisEditor((current) =>
                          current ? { ...current, text: event.target.value } : current
                        )
                      }
                      rows={10}
                      className="mt-2 text-base leading-7"
                    />
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {synthesisEditor.text.trim().split(/\s+/).filter(Boolean).length} mots
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSynthesisEditor(null)}
                          disabled={locked}
                          className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={saveSynthesis}
                          disabled={locked || synthesisEditor.text.trim().length < 20}
                          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {busy === saveKey ? "Enregistrement..." : "Enregistrer la synthèse"}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                <details className="border-t pt-4">
                  <summary className="min-h-11 cursor-pointer text-sm font-semibold text-primary">
                    Paramètres secondaires
                  </summary>
                  <div className="grid gap-4 pt-3 sm:grid-cols-[8rem_1fr]">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Rang</span>
                      <input
                        type="number"
                        min={0}
                        defaultValue={row.rank ?? ""}
                        onBlur={(event) => {
                          const value = event.target.value ? Number(event.target.value) : null;
                          if (row.presidentialId)
                            patchPresidential(row.presidentialId, { rank: value });
                        }}
                        className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={locked || !row.presidentialId}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Slogan</span>
                      <input
                        type="text"
                        defaultValue={row.slogan ?? ""}
                        onBlur={(event) => {
                          const value = event.target.value.trim() || null;
                          if (row.presidentialId)
                            patchPresidential(row.presidentialId, { slogan: value });
                        }}
                        className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={locked || !row.presidentialId}
                        placeholder={
                          row.presidentialId ? "Ex. : Vous protéger" : "Métadonnées absentes"
                        }
                      />
                    </label>
                  </div>
                  {row.politicianId && row.politicianPublicationStatus !== "PUBLISHED" && (
                    <Link
                      href={`/admin/politiques/${row.politicianId}`}
                      className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2"
                    >
                      Publier la personnalité
                    </Link>
                  )}
                </details>
              </div>
            </details>
          );
        })}
        {rows.length > 0 && visibleRows.length === 0 && (
          <p className="rounded-lg border p-6 text-center text-muted-foreground">
            Aucune candidature ne correspond à ces filtres.
          </p>
        )}
        {rows.length === 0 && (
          <p className="rounded-lg border p-6 text-center text-muted-foreground">
            Aucune candidature enregistrée.
          </p>
        )}
      </div>
    </div>
  );
}
