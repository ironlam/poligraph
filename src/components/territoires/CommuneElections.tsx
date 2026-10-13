import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  decidingTour,
  type CommuneScrutin,
  type ScrutinRow,
  type ScrutinTour,
} from "@/lib/territoires/commune-elections";
import { formatCount, formatPct } from "@/lib/territoires/commune-display";
import { TERRITOIRES_DONNEES_PATH } from "@/lib/territoires/paths";
import { formatDate, formatDateFrUTC } from "@/lib/utils";

/**
 * Folded election lines of a commune (#1052, kit Commune.html, Mobile.html, ElectionsHistorique.html).
 * Server components, native `<details>`: keyboard and screen readers work without script.
 *
 * Bars are neutral navy, never a party colour, and a missing share is a missing bar, not a zero.
 */

const LINK = "underline underline-offset-2 hover:text-primary";
const TAP = "inline-flex min-h-11 items-center";
const VISIBLE_ROWS = 5;

function tourLabel(round: 1 | 2): string {
  return round === 1 ? "1er tour" : "2d tour";
}

function ResultRow({ row, leader }: { row: ScrutinRow; leader: boolean }) {
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <p className="min-w-0">
          <span className="font-semibold">{row.label}</span>
          {row.detail && <span className="text-muted-foreground">{` · ${row.detail}`}</span>}
        </p>
        <p className="shrink-0 tabular-nums">
          {row.pct != null && <span className="font-semibold">{formatPct(row.pct)}</span>}
          {row.status && <span className="text-muted-foreground">{` · ${row.status}`}</span>}
          {row.votes != null && (
            <span className="text-muted-foreground">
              {(row.pct != null || row.status) && " · "}
              {formatCount(row.votes)} voix
            </span>
          )}
        </p>
      </div>
      {row.pct != null && (
        <div className="mt-1.5 h-2 w-full rounded-full bg-muted" aria-hidden="true">
          <div
            className={`h-2 rounded-full ${leader ? "bg-primary" : "bg-primary/45"}`}
            style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
          />
        </div>
      )}
    </li>
  );
}

function votersText(tour: ScrutinTour): string | null {
  const parts = [
    tour.actualVoters != null && tour.registeredVoters != null
      ? `${formatCount(tour.actualVoters)} votants sur ${formatCount(tour.registeredVoters)} inscrits`
      : null,
    tour.validVotes != null ? `${formatCount(tour.validVotes)} suffrages exprimés` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return `${parts.join(", ")}.`;
}

function TourResults({
  tour,
  rowsNoun,
  showTitle,
}: {
  tour: ScrutinTour;
  rowsNoun: string;
  showTitle: boolean;
}) {
  const visible = tour.rows.slice(0, VISIBLE_ROWS);
  const rest = tour.rows.slice(VISIBLE_ROWS);
  return (
    <div className="mt-3 first:mt-0">
      {showTitle && (
        <h4 className="text-sm font-semibold">
          {tourLabel(tour.round)}
          {tour.date && ` (${formatDate(tour.date)})`}
          {tour.participationRate != null && `, participation ${formatPct(tour.participationRate)}`}
        </h4>
      )}
      {votersText(tour) && (
        <p className="mt-0.5 text-sm text-muted-foreground">{votersText(tour)}</p>
      )}
      <ul>
        {visible.map((row, i) => (
          <ResultRow key={row.key} row={row} leader={i === 0} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-1 rounded-xl border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {`Autres ${rowsNoun} (${rest.length})`}
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <ul className="border-t px-4 py-1">
            {rest.map((row) => (
              <ResultRow key={row.key} row={row} leader={false} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Each round links to its own dataset when it has one: a figure stays traceable to its file. */
function Sources({ scrutin }: { scrutin: CommuneScrutin }) {
  const perRound = scrutin.tours.filter((t) => t.source !== null);
  return (
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
      Résultats de la commune dans ses limites à la date du scrutin, suffrages exprimés, sans
      étiquette ni lecture politique. Source :{" "}
      {perRound.length === 0 ? (
        <SourceLink label={scrutin.source.label} url={scrutin.source.url} />
      ) : (
        perRound.map((t, i) => {
          const src = t.source as NonNullable<typeof t.source>;
          return (
            <span key={t.round}>
              {i > 0 && ", "}
              <SourceLink label={src.label} url={src.url} />
              {` (${tourLabel(t.round)}`}
              {src.publishedAt && `, publié le ${formatDateFrUTC(src.publishedAt)}`}
              {")"}
            </span>
          );
        })
      )}
      {scrutin.electedSource && scrutin.tours.some((t) => t.rows.some((r) => r.status)) && (
        <>
          {". Mention d'élu : "}
          <SourceLink label={scrutin.electedSource.label} url={scrutin.electedSource.url} />
        </>
      )}
      {scrutin.importedAt && <> · importé le {formatDate(scrutin.importedAt)}</>}
    </p>
  );
}

function SourceLink({ label, url }: { label: string; url: string | null }) {
  if (!url) return <>{label}</>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={LINK}>
      {label}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function Detail({ scrutin }: { scrutin: CommuneScrutin }) {
  // Last round first: it decides the ballot and fits in a few lines.
  const tours = [...scrutin.tours].reverse();
  return (
    <div className="border-t px-4 py-3">
      {tours.map((tour) => (
        <TourResults key={tour.round} tour={tour} rowsNoun={scrutin.rowsNoun} showTitle />
      ))}
      <Sources scrutin={scrutin} />
      <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
        <Link href={scrutin.resultsHref} prefetch={false} className={`${TAP} ${LINK}`}>
          {scrutin.resultsLabel}
        </Link>
        <Link href={TERRITOIRES_DONNEES_PATH} prefetch={false} className={`${TAP} ${LINK}`}>
          Méthode
        </Link>
      </p>
    </div>
  );
}

/**
 * One folded line. Collapsed: title, round and date, turnout, and on desktop the leading row
 * with its share. Mobile moves the leader into the detail so the line stays two rows high.
 */
export function ScrutinLine({
  scrutin,
  defaultOpen = false,
}: {
  scrutin: CommuneScrutin;
  defaultOpen?: boolean;
}) {
  const tour = decidingTour(scrutin);
  const lead = tour.rows[0];
  return (
    <details className="group rounded-xl border" open={defaultOpen}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] md:items-center md:gap-4">
          <span className="block font-semibold">{scrutin.title}</span>
          <span className="block text-sm text-muted-foreground">
            {tourLabel(tour.round)}
            {tour.date && `, ${formatDate(tour.date)}`}
            {tour.participationRate != null &&
              ` · participation ${formatPct(tour.participationRate)}`}
          </span>
          {lead && lead.pct != null && (
            <span className="hidden truncate text-sm md:block">
              {lead.label} <span className="font-semibold tabular-nums">{formatPct(lead.pct)}</span>
            </span>
          )}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <Detail scrutin={scrutin} />
    </details>
  );
}
