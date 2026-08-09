"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Search, UserRound } from "lucide-react";
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
import { CandidacyStatusBadge } from "./CandidacyStatusBadge";

/**
 * The field as a list of rows rather than a grid of cards.
 *
 * Twenty-five homogeneous entries are a table, not a stack of cards: the old cards spent ~190px
 * each on repeating the same badge and the same "Fiche PoliGraph" button, and showed none of our
 * own work. Each row now carries what we have on that candidacy.
 *
 * The row is NOT itself a link any more, and that is the point of `ConsultCell`: it led to a page
 * that silently redirects elsewhere for half the field, so one gesture had two destinations and
 * named neither.
 *
 * ZERO flat fill in the list, which is what the third pass of the handoff turns on. A navy button
 * repeated twenty-eight times stops reading as an action and becomes the only pattern the eye
 * sees; the name of the candidate, which is what the reader came for, drops to second place. The
 * links are now found by their INVARIABLE POSITION (the "Consulter" column above lg, the footer
 * band below) and by their navy colour, not by their weight. The one coloured element left is the
 * status badge, and that is information rather than an action.
 *
 * A client component, deliberately. Filtering through `searchParams` on the server would make the
 * hub page dynamic and cost it its ISR; the whole field is twenty-five rows already in the payload,
 * so it filters here and writes the URL back for shareability. The rows are still server-rendered.
 *
 * NOT a `<table>`: every cell says its own unit ("8 sujets documentés sur 13") so a screen reader
 * needs no column header to read it, and the visual header row is decorative.
 */

const TOTAL_THEMES = 13;

/**
 * Column widths, shared by the decorative header and every row so the grid actually lines up.
 *
 * Written out twice rather than composed, because Tailwind scans this file as TEXT: a class built
 * at runtime (`` `lg:${COL}` ``) is never emitted and the column silently sizes to its content.
 * The header lives inside an `lg:flex` container, so it needs no prefix; the row is a stack below
 * lg and only becomes a grid above it.
 */
const COL_PROGRAMME = "w-[230px] shrink-0";
const COL_PROGRAMME_ROW = "lg:w-[230px] lg:shrink-0";
const COL_CONSULT = "w-[210px] shrink-0";
const COL_CONSULT_ROW = "lg:w-[210px] lg:shrink-0";

/**
 * One slot of the "Consulter" column, whatever it holds.
 *
 * The height is fixed per breakpoint rather than per content, and that is the whole reason the
 * placeholder exists: a row without a candidacy fiche has to leave the Poligraph link at the same
 * y as its neighbours, otherwise the second link zigzags down the column. 44px on mobile is the
 * touch target; 32px above lg fits both a single 13px line and the two-line placeholder.
 */
const SLOT =
  "flex min-h-11 flex-1 items-center justify-center gap-2 px-2 text-center lg:min-h-[32px] lg:flex-none lg:justify-start lg:px-0 lg:text-left";

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
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-xs font-bold text-muted-foreground-strong"
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
 * The line under the badge: our coverage, and when there is none, why.
 *
 * The zero case is two different facts and gets two different sentences. "Aucun programme publié"
 * is about the candidacy; "Programme publié, pas encore documenté" is about our own backlog. Saying
 * the first when the second is true would blame a candidate for our delay.
 *
 * The measure COUNT lives in the badge now, so this line carries what the badge cannot: the spread
 * over the thirteen subjects. Repeating "12 mesures" two lines below "Déclarée · 12 mesures" would
 * spend the row's quietest line on an echo.
 *
 * "Documenté" rather than "dépouillé" throughout, and the reason is specific to this site: on a
 * page about an election, dépouillement is what happens to ballots. The word sent the reader to the
 * count, not to the reading of a programme.
 */
function ProgrammeLine({ candidacy }: { candidacy: HubCandidacy }) {
  if (candidacy.measureCount === 0) {
    // Three branches, not a binary. `resolveProgrammeAbsence` never returns null at zero measures,
    // so the third one is unreachable through `getHubCandidacyField` today; it exists because a
    // two-branch fallback puts "Aucun programme publié" on a candidacy whose data we simply do not
    // have, which is a false claim about a person made out of a missing field. The third sentence
    // speaks only about us.
    const absence =
      candidacy.programmeAbsence === "aucun_programme"
        ? "Aucun programme publié à ce jour"
        : candidacy.programmeAbsence === "non_depouille"
          ? "Programme publié, pas encore documenté"
          : "Pas encore documenté par Poligraph";

    return (
      <span
        data-programme-absence={candidacy.programmeAbsence}
        className="block text-xs leading-snug text-muted-foreground-strong"
      >
        {absence}
      </span>
    );
  }

  return (
    <span className="block text-xs leading-snug text-muted-foreground-strong">
      {candidacy.themesCoveredCount === 1
        ? `1 sujet documenté sur ${TOTAL_THEMES}`
        : `${candidacy.themesCoveredCount} sujets documentés sur ${TOTAL_THEMES}`}
    </span>
  );
}

/**
 * Our page is what is missing, not the candidacy.
 *
 * Poligraph does not declare candidacies, so "Candidature à venir" would state something about a
 * person that we are in no position to state. The two lines say whose delay it is.
 *
 * Inert on purpose: `aria-hidden` would hide the only explanation a screen reader gets for the
 * missing link, so it stays in the accessibility tree as plain text.
 */
function FichePlaceholder({ withDivider }: { withDivider: boolean }) {
  return (
    <span
      // `lg:pl-[23px]`: the two links start after a 15px icon and a 8px gap, and a note that
      // begins 23px to their left turns the column into a ragged edge, which is the opposite of
      // the invariable position the whole variant rests on.
      className={`${SLOT} flex-col gap-px leading-tight text-muted-foreground-strong lg:flex-col lg:items-start lg:pl-[23px] ${
        withDivider ? "border-r border-border/60 lg:border-r-0" : ""
      }`}
    >
      <span className="font-display text-[13px] font-bold">Fiche candidature à venir</span>
      {/* `lg:sr-only`, not `lg:hidden`: the second line is what the 44px half of the mobile band
          is for, and above lg it would push the Poligraph link 13px below the one on the row
          next door, the exact zigzag the fixed slot height exists to prevent. Kept in the
          accessibility tree at every width rather than dropped from it. */}
      <span className="text-[11px] lg:sr-only">dès que nous l&apos;aurons documentée</span>
    </span>
  );
}

/**
 * The two destinations a row leads to, named rather than guessed, at a constant position.
 *
 * There used to be one link on the name, pointing at the candidacy fiche. That page redirects to
 * the politician's fiche when it has no verified measure, so the same gesture landed on two
 * different pages depending on a rule the reader cannot see, and said nothing about it.
 *
 * Above lg the pair is a third column titled "Consulter", separated by a rule; below it, a footer
 * band split into two halves of 44px. Never a filled button, never a full-width button: in a list,
 * a button that repeats on every row is decoration.
 */
function ConsultCell({ candidacy }: { candidacy: HubCandidacy }) {
  const slug = candidacy.politicianSlug;

  // No linked politician: neither destination exists, and the placeholder alone keeps the row
  // aligned with its neighbours instead of collapsing the column.
  if (slug === null) {
    return <FichePlaceholder withDivider={false} />;
  }

  const linkClass = `${SLOT} font-display text-[13px] font-bold text-primary hover:bg-muted/60 lg:hover:bg-transparent lg:hover:underline`;

  return (
    <>
      {candidacy.ficheAvailable ? (
        <Link
          href={`/elections/presidentielle-2027/candidats/${slug}`}
          prefetch={false}
          className={`${linkClass} border-r border-border/60 lg:border-r-0`}
        >
          <FileText aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
          Sa candidature
          <span className="sr-only"> pour la présidentielle 2027, {candidacy.candidateName}</span>
        </Link>
      ) : (
        <FichePlaceholder withDivider />
      )}
      <Link href={`/politiques/${slug}`} prefetch={false} className={linkClass}>
        <UserRound aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
        Fiche Poligraph
        <span className="sr-only">, {candidacy.candidateName}</span>
      </Link>
    </>
  );
}

/**
 * One DOM for both layouts rather than two hidden copies.
 *
 * The previous row rendered the measure and the source twice, once per breakpoint, which doubled
 * every assertion and every screen-reader pass. Here the same three blocks reflow: stacked card
 * with a footer band below lg, three columns above it.
 */
function CandidacyRow({ candidacy }: { candidacy: HubCandidacy }) {
  const isRetiree = candidacy.status === "RETIRE";

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <div className="flex flex-col lg:flex-row lg:items-center lg:gap-5 lg:px-4 lg:py-3 lg:hover:bg-muted/40">
        <div className="flex items-center gap-3 px-4 pt-3 lg:min-w-0 lg:flex-1 lg:px-0 lg:pt-0">
          <PartyMark candidacy={candidacy} />
          <span className="min-w-0">
            <span
              className={`block font-display text-base font-bold tracking-tight ${
                isRetiree ? "text-muted-foreground-strong line-through" : ""
              }`}
            >
              {candidacy.candidateName}
            </span>
            {candidacy.partyLabel !== null && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground-strong">
                {candidacy.partyLabel}
              </span>
            )}
          </span>
        </div>

        <div
          className={`flex flex-col gap-1.5 px-4 pb-3 pt-2 ${COL_PROGRAMME_ROW} lg:px-0 lg:pb-0 lg:pt-0`}
        >
          <CandidacyStatusBadge
            status={candidacy.status}
            measureCount={candidacy.measureCount}
            programmeAbsence={candidacy.programmeAbsence}
            sourceUrl={candidacy.sourceUrl}
            sourceLabel={candidacy.sourceLabel}
          />
          <ProgrammeLine candidacy={candidacy} />
        </div>

        <div
          className={`flex items-stretch border-t border-border/60 bg-muted/30 ${COL_CONSULT_ROW} lg:flex-col lg:items-start lg:gap-1 lg:border-l lg:border-t-0 lg:bg-transparent lg:pl-5`}
        >
          <ConsultCell candidacy={candidacy} />
        </div>
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
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground-strong" />
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
          <p className="text-xs text-muted-foreground-strong">
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
        className="hidden items-center gap-5 border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground-strong lg:flex"
      >
        <span className="min-w-0 flex-1">Candidature</span>
        <span className={COL_PROGRAMME}>Programme documenté</span>
        <span className={`${COL_CONSULT} border-l border-border/60 pl-5`}>Consulter</span>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground-strong">
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
