import { Card, CardContent } from "@/components/ui/card";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine, type SourceRef } from "@/components/ui/SourceLine";
import { DataStatus } from "@/components/parlement/legislature/DataStatus";
import { PositionCountBar } from "@/components/votes/PositionCountBar";
import { PositionCountLegend } from "@/components/votes/PositionCountLegend";
import { formatDate } from "@/lib/utils";
import {
  WITHHELD_GROUP_REASON_TEXT,
  type HistoricalGroupRow,
  type HistoricalNotice,
  type HistoricalPositionsView,
  type HistoricalSource,
  type WithheldGroup,
} from "@/lib/votes/historical-positions";

interface HistoricalGroupPositionsProps {
  view: HistoricalPositionsView;
  /** Date of the scrutin: the date the group of each deputy is read at. */
  scrutinDate: Date;
}

const UNAVAILABLE_COPY = {
  "no-published-run": {
    title: "Votes par groupe pas encore disponibles",
    body: "PoliGraph n'a pas encore calculé le vote par groupe de ce scrutin. Ce n'est pas une absence de vote : le résultat officiel et les votes individuels restent affichés.",
  },
  "read-error": {
    title: "Décompte par groupe momentanément indisponible",
    body: "Les groupes de ce scrutin n'ont pas pu être lus. Le résultat officiel et les votes individuels restent affichés.",
  },
} as const;

const WITHHELD_COPY = {
  "count-discordant": {
    title: "Décompte par groupe non présenté",
    body: "La somme des votes individuels publiés ne correspond pas aux totaux que l'Assemblée nationale publie pour ce scrutin. Tant que cet écart n'est pas expliqué, PoliGraph ne présente aucun décompte par groupe. Le résultat officiel et les votes individuels restent consultables sur cette page.",
  },
  "count-unverifiable": {
    title: "Décompte par groupe non présenté",
    body: "Les totaux publiés pour ce scrutin ne permettent pas de vérifier les votes individuels, groupe par groupe. PoliGraph ne présente donc pas de décompte par groupe. Le résultat officiel et les votes individuels restent consultables sur cette page.",
  },
  "no-group-presentable": {
    title: "Aucun groupe présentable pour ce scrutin",
    body: "Les totaux de ce scrutin recoupent ceux de l'Assemblée nationale, mais aucun groupe ne peut être présenté avec certitude. Les raisons sont indiquées ci-dessous.",
  },
} as const;

function groupName(row: { label: string; abbreviation: string | null }) {
  return (
    <>
      {row.label}
      {row.abbreviation && row.abbreviation !== row.label ? (
        <span className="ml-1 font-normal text-muted-foreground">({row.abbreviation})</span>
      ) : null}
    </>
  );
}

function sourcesOf(source: HistoricalSource): SourceRef[] {
  const refs: SourceRef[] = [];
  refs.push({
    label: "Assemblée nationale, Scrutins (données ouvertes)",
    ...(source.scrutins.url ? { url: source.scrutins.url } : {}),
  });
  refs.push({
    label: "Assemblée nationale, acteurs, mandats et organes (données ouvertes)",
    ...(source.affiliations.url ? { url: source.affiliations.url } : {}),
  });
  return refs;
}

function sourceNote(source: HistoricalSource): string {
  const base = "Décompte calculé par PoliGraph à partir de ces deux jeux de données";
  return source.affiliations.asOf
    ? `${base} · Groupes et mandats arrêtés au ${formatDate(source.affiliations.asOf)}`
    : base;
}

function Notices({ notices }: { notices: HistoricalNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
      {notices.map((notice) => (
        <li key={notice.kind}>{notice.text}</li>
      ))}
    </ul>
  );
}

function WithheldGroups({ groups }: { groups: WithheldGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold">Groupes non présentés</h4>
      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
        {groups.map((group) => (
          <li key={`${group.label}-${group.reason}`}>
            <span className="font-medium text-foreground">{groupName(group)}</span>
            {" : "}
            {WITHHELD_GROUP_REASON_TEXT[group.reason]}.
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountsList({ rows }: { rows: HistoricalGroupRow[] }) {
  return (
    <ul className="mt-3 divide-y sm:hidden" aria-label="Votes par groupe">
      {rows.map((row) => (
        <li key={row.organRef} className="py-3">
          <p className="font-medium">{groupName(row)}</p>
          <PositionCountBar
            forCount={row.forCount}
            againstCount={row.againstCount}
            abstainCount={row.abstainCount}
            className="mt-2"
          />
          <PositionCountLegend
            forCount={row.forCount}
            againstCount={row.againstCount}
            abstainCount={row.abstainCount}
            nonVoterCount={row.nonVoterCount}
            className="mt-2"
          />
        </li>
      ))}
    </ul>
  );
}

function CountsTable({ rows, date }: { rows: HistoricalGroupRow[]; date: string }) {
  return (
    <div
      className="mt-3 hidden overflow-x-auto sm:block"
      role="region"
      aria-label="Votes par groupe"
      tabIndex={0}
    >
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">
          Pour, contre, abstentions et non-votants de chaque groupe, selon le groupe de chaque
          député le {date}.
        </caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Groupe
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Pour
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Contre
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Abstentions
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Non-votants
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.organRef} className="border-b last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                {groupName(row)}
                <PositionCountBar
                  forCount={row.forCount}
                  againstCount={row.againstCount}
                  abstainCount={row.abstainCount}
                  className="mt-1.5 max-w-xs"
                />
              </th>
              <td className="px-2 py-2 text-right align-top tabular-nums">{row.forCount}</td>
              <td className="px-2 py-2 text-right align-top tabular-nums">{row.againstCount}</td>
              <td className="px-2 py-2 text-right align-top tabular-nums">{row.abstainCount}</td>
              <td className="px-2 py-2 text-right align-top tabular-nums">{row.nonVoterCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HowToRead() {
  return (
    <details className="mt-4 rounded-md border px-4 py-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Comment lire ces chiffres
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          Le groupe de chaque député est celui que le référentiel de l&apos;Assemblée nationale lui
          donne le jour du scrutin, pas celui qu&apos;il occupe aujourd&apos;hui.
        </p>
        <p>
          Un groupe ne vote pas d&apos;un seul bloc : « Pour 12, Contre 3 » ne dit pas ce que le
          groupe a décidé. PoliGraph n&apos;en tire aucune position majoritaire. Les non-votants
          sont comptés à part, selon le classement de l&apos;Assemblée, qui y range notamment les
          membres du Gouvernement et la personne qui préside la séance.{" "}
          <a
            href="/methodologie#votes-historiques-des-groupes"
            className="underline hover:text-primary"
          >
            Méthodologie
          </a>
        </p>
      </div>
    </details>
  );
}

/**
 * Bloc C2 de la page de scrutin : les votes individuels publiés, additionnés par groupe à la date
 * du scrutin. Ce n'est ni le décompte par groupe publié par l'institution (bloc C1), dont il est
 * le repli quand celui-ci n'est pas affiché, ni une position majoritaire : le composant n'en
 * affiche jamais.
 */
export function HistoricalGroupPositions({ view, scrutinDate }: HistoricalGroupPositionsProps) {
  const date = formatDate(scrutinDate);

  if (view.kind === "unavailable") {
    if (view.cause === "legislature-not-covered") {
      return (
        <MissingData title="Votes par groupe pas encore documentés" className="mb-8">
          Pour la {view.legislature}
          <sup>e</sup> législature, PoliGraph ne calcule pas encore le vote par groupe. Le résultat
          officiel et les votes individuels restent affichés.
        </MissingData>
      );
    }
    const copy = UNAVAILABLE_COPY[view.cause];
    return (
      <MissingData title={copy.title} className="mb-8">
        {copy.body}
      </MissingData>
    );
  }

  if (view.kind === "withheld") {
    const copy = WITHHELD_COPY[view.cause];
    return (
      <MissingData title={copy.title} className="mb-8">
        <p>{copy.body}</p>
        <Notices notices={view.notices} />
        <WithheldGroups groups={view.withheldGroups} />
        <SourceLine
          sources={sourcesOf(view.source)}
          consultedAt={view.source.scrutins.fetchedAt}
          className="mt-3"
        />
      </MissingData>
    );
  }

  return (
    <Card className="mb-8">
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Votes par groupe le {date}</h3>
          <DataStatus
            status={view.completeness}
            scope="Décompte par groupe"
            showScope
            description={
              view.completeness === "complete"
                ? "Tous les groupes de ce scrutin sont présentés, et la somme des votes individuels recoupe le résultat publié par l'Assemblée nationale."
                : "Certains groupes ou certains votes ne sont pas présentés. Les raisons sont indiquées sous le tableau."
            }
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Calculé par PoliGraph à partir des votes individuels publiés par l&apos;Assemblée
          nationale, selon le groupe de chaque député le jour du scrutin.
        </p>
        <CountsList rows={view.rows} />
        <CountsTable rows={view.rows} date={date} />
        <Notices notices={view.notices} />
        <WithheldGroups groups={view.withheldGroups} />
        <HowToRead />
        <SourceLine
          sources={sourcesOf(view.source)}
          consultedAt={view.source.scrutins.fetchedAt}
          note={sourceNote(view.source)}
          className="mt-3"
        />
      </CardContent>
    </Card>
  );
}
