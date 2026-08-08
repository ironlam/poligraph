"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { CANDIDACY_STATUS_LABELS } from "@/config/labels";
import { getAccessibleTextColor } from "@/lib/contrast";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  parseCandidacyFilter,
  type CandidacyFilter,
} from "@/lib/presidentielle/candidacy-filters";

/**
 * The field as a list of rows rather than a grid of cards.
 *
 * Twenty-five homogeneous entries are a table, not a stack of cards: the old cards spent ~190px
 * each on repeating the same badge and the same "Fiche PoliGraph" button, and showed none of our
 * own work. Each row now carries what we have on that candidacy.
 *
 * The row is NOT itself a link any more, and that is the point of `RowLinks`: it led to a page that
 * silently redirects elsewhere for half the field, so one gesture had two destinations and named
 * neither.
 *
 * A client component, deliberately. Filtering through `searchParams` on the server would make the
 * hub page dynamic and cost it its ISR; the whole field is twenty-five rows already in the payload,
 * so it filters here and writes the URL back for shareability. The rows are still server-rendered.
 *
 * NOT a `<table>`: every cell says its own unit ("12 mesures documentées", "8 sujets sur 13") so a
 * screen reader needs no column header to read it, and the visual header row is decorative.
 */

const TOTAL_THEMES = 13;

/**
 * The party mark: a monogram, never a logo, on every row.
 *
 * Measured rather than assumed. At 38px the real logos of this field split into two populations:
 * roundels stay legible, wordmarks (Lutte ouvrière, UPR, PS, Horizons, Nouvelle Énergie) collapse
 * into an unreadable smear. Three optical scales on three consecutive rows is exactly what the
 * handoff set out to remove, so the mark is consistent by construction and the party name is
 * written in full beside it anyway.
 *
 * Decorative (`aria-hidden`): announcing initials that the next line already spells out adds noise
 * for a screen reader. Initials are NOT hardcoded white, because two party colours of this palette
 * are pale yellows on which white text falls near 1.1:1; `getAccessibleTextColor` picks whichever
 * of black or white actually contrasts.
 */
function PartyMark({ candidacy }: { candidacy: HubCandidacy }) {
  const initials =
    candidacy.partyShortName?.slice(0, 3) ??
    candidacy.candidateName
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

  if (candidacy.partyColor === null) {
    return (
      <span
        aria-hidden="true"
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-xs font-bold text-muted-foreground"
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-xs font-bold"
      style={{
        backgroundColor: candidacy.partyColor,
        color: getAccessibleTextColor(candidacy.partyColor),
      }}
    >
      {initials}
    </span>
  );
}

/**
 * What we have on this candidacy, and when we have nothing, why.
 *
 * The zero case is two different facts and gets two different sentences. "Aucun programme publié"
 * is about the candidacy; "Programme publié, pas encore documenté" is about our own backlog. Saying
 * the first when the second is true would blame a candidate for our delay.
 *
 * "Documenté" rather than "dépouillé" throughout, and the reason is specific to this site: on a
 * page about an election, dépouillement is what happens to ballots. The word sent the reader to the
 * count, not to the reading of a programme. It was also the minority term — the fiche and the hub
 * cards already said "documentées" — so one screen contradicted the next.
 */
function MeasureCell({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.measureCount === 0) {
    return (
      <span
        data-programme-absence={candidacy.programmeAbsence}
        className="block text-xs leading-snug text-muted-foreground"
      >
        {candidacy.programmeAbsence === "non_depouille"
          ? "Programme publié, pas encore documenté"
          : "Aucun programme publié à ce jour"}
      </span>
    );
  }

  return (
    <span className="block leading-tight">
      <span className="font-display text-lg font-extrabold">{candidacy.measureCount}</span>{" "}
      <span className="text-xs text-muted-foreground">
        {candidacy.measureCount === 1 ? "mesure documentée" : "mesures documentées"}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {candidacy.themesCoveredCount} sur {TOTAL_THEMES} sujets
      </span>
    </span>
  );
}

/**
 * The source, on one line and never more.
 *
 * `sourceLabel` holds whole quotations of up to ~115 characters, which on the old card were the
 * loudest thing on the row: a source has to be verifiable, not dominant. The full wording stays in
 * `title` and on the fiche.
 *
 * `max-w-full` on the link and `min-w-0` on the span are both required: an `inline-flex` box sizes
 * to its content and happily overflows its parent, and a flex child refuses to shrink below its
 * content width without `min-w-0`, so `truncate` alone silently does nothing.
 */
function SourceLink({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.sourceUrl === null || candidacy.sourceLabel === null) return null;

  return (
    <a
      href={candidacy.sourceUrl}
      rel="nofollow noopener"
      target="_blank"
      title={candidacy.sourceLabel}
      className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">{candidacy.sourceLabel}</span>
    </a>
  );
}

/**
 * The two destinations a row leads to, named rather than guessed.
 *
 * There used to be one link on the name, pointing at the candidacy fiche. That page
 * redirects to the politician's fiche when it has no verified measure, so the same
 * gesture landed on two different pages depending on a rule the reader cannot see, and
 * said nothing about it. Naming both destinations costs one line and removes the
 * surprise entirely.
 *
 * The unavailable case is stated, not hidden: "fiche de candidature à venir" tells the
 * reader the page exists as an intention and is not ready, which is true, instead of
 * quietly dropping them somewhere else.
 */
function RowLinks({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.politicianSlug === null) return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {candidacy.ficheAvailable ? (
        <Link
          href={`/elections/presidentielle-2027/candidats/${candidacy.politicianSlug}`}
          prefetch={false}
          className="inline-flex min-h-[32px] items-center font-bold text-primary hover:underline"
        >
          Sa candidature
          <span className="sr-only"> pour la présidentielle 2027, {candidacy.candidateName}</span>
        </Link>
      ) : (
        <span className="inline-flex min-h-[32px] items-center text-muted-foreground">
          Fiche de candidature à venir
        </span>
      )}
      <Link
        href={`/politiques/${candidacy.politicianSlug}`}
        prefetch={false}
        className="inline-flex min-h-[32px] items-center text-muted-foreground hover:text-foreground hover:underline"
      >
        Sa fiche Poligraph
        <span className="sr-only">, {candidacy.candidateName}</span>
      </Link>
    </span>
  );
}

function CandidacyRow({ candidacy }: { candidacy: HubCandidacy }) {
  const isRetiree = candidacy.status === "RETIRE";
  const statusLabel = candidacy.status === null ? null : CANDIDACY_STATUS_LABELS[candidacy.status];

  const identity = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <PartyMark candidacy={candidacy} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`font-display text-base font-bold tracking-tight ${
              isRetiree ? "text-muted-foreground line-through" : ""
            }`}
          >
            {candidacy.candidateName}
          </span>
          {/* The badge appears only when the status is NOT "déclarée". Twenty of twenty-five rows
              carry the same status, so repeating it says nothing; the five exceptions are the
              information. */}
          {candidacy.status !== null && candidacy.status !== "DECLARE" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">
              {statusLabel}
            </span>
          )}
        </span>
        {candidacy.partyLabel !== null && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {candidacy.partyLabel}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <div className="flex items-start gap-3 px-4 pt-3 lg:items-center lg:gap-5 lg:py-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {identity}
          <span className="lg:hidden">
            <RowLinks candidacy={candidacy} />
          </span>
        </span>

        <span className="hidden w-[168px] shrink-0 lg:block">
          <MeasureCell candidacy={candidacy} />
        </span>

        <span className="hidden w-[220px] shrink-0 lg:block">
          <SourceLink candidacy={candidacy} />
        </span>

        <span className="hidden w-[190px] shrink-0 lg:block">
          <RowLinks candidacy={candidacy} />
        </span>
      </div>

      {/* Below lg the two columns fold under the name rather than shrinking. The source folds with
          them rather than disappearing: this site is read on a phone first, and a status the reader
          cannot check is exactly what the section exists to avoid. */}
      <div className="space-y-1 px-4 pb-3 lg:hidden">
        <MeasureCell candidacy={candidacy} />
        <SourceLink candidacy={candidacy} />
      </div>
    </li>
  );
}

export function CandidacyFieldBrowser({ candidacies }: { candidacies: HubCandidacy[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filtre = parseCandidacyFilter(searchParams.get("statut"));
  const query = searchParams.get("q") ?? "";

  const counts = Object.fromEntries(
    CANDIDACY_FILTERS.map((key) => [
      key,
      candidacies.filter((c) => matchesCandidacyFilter(c, key)).length,
    ])
  ) as Record<CandidacyFilter, number>;

  const sansProgramme = candidacies.filter((c) => c.programmeAbsence === "aucun_programme").length;

  const visible = candidacies.filter(
    (c) => matchesCandidacyFilter(c, filtre) && matchesCandidacyQuery(c, query)
  );

  function update(next: { statut?: CandidacyFilter; q?: string }): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next.statut !== undefined) {
      if (next.statut === "toutes") params.delete("statut");
      else params.set("statut", next.statut);
    }
    if (next.q !== undefined) {
      if (next.q === "") params.delete("q");
      else params.set("q", next.q);
    }
    const qs = params.toString();
    router.replace(qs === "" ? "?" : `?${qs}`, { scroll: false });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border px-3 sm:max-w-xs">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Filtrer les candidatures par nom ou par parti</span>
          <input
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Un nom, un parti"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {CANDIDACY_FILTERS.map((key) => {
            const active = key === filtre;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => update({ statut: key })}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-[13px] transition-colors ${
                  active
                    ? "bg-foreground font-bold text-background"
                    : "border border-border hover:bg-muted"
                }`}
              >
                {CANDIDACY_FILTER_LABELS[key]} · {counts[key]}
              </button>
            );
          })}
        </div>

        {/* The gap, counted and stated. Leaving the reader to infer it from twenty-five rows would
            hide the one fact this section is least able to show. */}
        {sansProgramme > 0 && (
          <p className="text-xs text-muted-foreground">
            {sansProgramme}{" "}
            {sansProgramme === 1
              ? "candidature n'a publié aucun programme à ce jour"
              : "candidatures n'ont publié aucun programme à ce jour"}
            .
          </p>
        )}
      </div>

      {/* Decorative: every cell below states its own unit, so this row adds sighted alignment
          only. Announcing it would promise a table the markup deliberately is not. */}
      <div
        aria-hidden="true"
        className="hidden items-center gap-5 border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground lg:flex"
      >
        <span className="min-w-0 flex-1">Candidature</span>
        <span className="w-[168px] shrink-0">Ce que nous avons documenté</span>
        <span className="w-[220px] shrink-0">Source de la candidature</span>
        <span className="w-[190px] shrink-0">Où aller</span>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Aucune candidature ne correspond à ce filtre.{" "}
          <button
            type="button"
            onClick={() => update({ statut: "toutes", q: "" })}
            className="min-h-11 underline hover:text-foreground"
          >
            Tout afficher
          </button>
        </p>
      ) : (
        <ul>
          {visible.map((candidacy) => (
            <CandidacyRow key={candidacy.id} candidacy={candidacy} />
          ))}
        </ul>
      )}
    </div>
  );
}
