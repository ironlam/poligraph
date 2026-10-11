import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type {
  CommunePresidentielles,
  PresidentielleCandidatCommune,
  PresidentielleCommuneBlock,
  PresidentielleTourCommune,
} from "@/lib/data/territoires-presidentielle";
import { formatCount, formatPct } from "@/lib/territoires/commune-display";
import { formatDate, formatDateFrUTC } from "@/lib/utils";

/**
 * Presidential results of a commune (#1052, lot 1.9). Server component, no client state.
 *
 * Round 2 comes first: it decides the election and fits in two lines, so a reader on a 320 px
 * screen gets the outcome before the twelve rows of round 1, of which only the first five are
 * open. Bars are neutral grey and candidates carry no party label or colour.
 */

const LINK = "underline underline-offset-2 hover:text-primary";
const TAP = "inline-flex min-h-11 items-center";
const VISIBLE_CANDIDATES = 5;

function CandidatRow({
  candidat,
  leader = false,
}: {
  candidat: PresidentielleCandidatCommune;
  leader?: boolean;
}) {
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <p className="min-w-0 font-semibold">{candidat.name}</p>
        <p className="shrink-0 tabular-nums">
          {candidat.pct != null && <span className="font-semibold">{formatPct(candidat.pct)}</span>}
          <span className="text-muted-foreground">
            {candidat.pct != null && " · "}
            {formatCount(candidat.votes)} voix
          </span>
        </p>
      </div>
      {candidat.pct != null && (
        <div className="mt-1.5 h-2 w-full rounded-full bg-muted" aria-hidden="true">
          <div
            className={`h-2 rounded-full ${leader ? "bg-primary" : "bg-primary/45"}`}
            style={{ width: `${Math.min(100, Math.max(0, candidat.pct))}%` }}
          />
        </div>
      )}
    </li>
  );
}

function participation(tour: PresidentielleTourCommune): string | null {
  const parts = [
    tour.participationRate != null ? `participation ${formatPct(tour.participationRate)}` : null,
    tour.actualVoters != null && tour.registeredVoters != null
      ? `${formatCount(tour.actualVoters)} votants sur ${formatCount(tour.registeredVoters)} inscrits`
      : null,
    tour.validVotes != null ? `${formatCount(tour.validVotes)} suffrages exprimés` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function Tour({ tour }: { tour: PresidentielleTourCommune }) {
  const visible = tour.candidats.slice(0, VISIBLE_CANDIDATES);
  const rest = tour.candidats.slice(VISIBLE_CANDIDATES);
  const text = participation(tour);
  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold">
        {tour.round === 1 ? "1er tour" : "2d tour"}
        {tour.date && ` (${formatDate(tour.date)})`}
      </h4>
      {text && <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>}
      {tour.candidats.length > 0 ? (
        <ul className="mt-1">
          {visible.map((c, i) => (
            <CandidatRow key={c.name} candidat={c} leader={i === 0} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm">Les voix par candidat ne sont pas enregistrées.</p>
      )}
      {rest.length > 0 && (
        <details className="group mt-2 rounded-xl border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {`Autres candidats (${rest.length})`}
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <ul className="border-t px-4 py-1">
            {rest.map((c) => (
              <CandidatRow key={c.name} candidat={c} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PresidentielleCommuneResults({
  block,
  communeName,
}: {
  block: PresidentielleCommuneBlock;
  communeName: string;
}) {
  const tours = [...block.tours].sort((a, b) => b.round - a.round);
  return (
    <div>
      <h3 className="font-semibold">
        {block.title} à {communeName}
      </h3>
      {tours.map((tour) => (
        <Tour key={tour.round} tour={tour} />
      ))}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Voix et part des suffrages exprimés dans la commune, dans ses limites à la date du scrutin,
        sans étiquette politique. Source : {block.sources[0]?.label ?? "ministère de l'Intérieur"}
        {block.sources.map((s) => (
          <span key={s.round}>
            {", "}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              {s.round === 1 ? "1er tour" : "2d tour"}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            {` publié le ${formatDateFrUTC(s.publishedAt)}`}
          </span>
        ))}
        {block.importedAt && <> · importé le {formatDate(block.importedAt)}</>}
      </p>
      <p className="mt-2 text-sm">
        <Link
          href={`/elections/${block.electionSlug}`}
          prefetch={false}
          className={`${TAP} ${LINK}`}
        >
          Résultats nationaux de cette élection
        </Link>
      </p>
    </div>
  );
}

/** Territory published as one aggregate: say so, show no figure. */
export function PresidentielleAgregatNote({
  agregat,
}: {
  agregat: NonNullable<CommunePresidentielles["agregatTerritoire"]>;
}) {
  return (
    <p className="text-sm">
      <strong>{agregat.electionTitle} :</strong> le ministère de l{"'"}Intérieur publie un seul
      résultat pour l{"'"}ensemble de {agregat.territoire}, sans détail par circonscription. Aucun
      résultat propre à cette circonscription n{"'"}est donc affiché.
    </p>
  );
}
