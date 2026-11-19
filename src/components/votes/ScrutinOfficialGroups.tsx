import { Card, CardContent } from "@/components/ui/card";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import { GROUP_POSITION_LABELS } from "@/config/labels";
import { PositionCountBar } from "@/components/votes/PositionCountBar";
import { PositionCountLegend } from "@/components/votes/PositionCountLegend";
import { cn } from "@/lib/utils";
import type { OfficialGroupCountsView, OfficialSource } from "@/lib/votes/scrutin-provenance";
import type { GroupPosition } from "@/types";

interface ScrutinOfficialGroupsProps {
  view: OfficialGroupCountsView;
  source: OfficialSource | null;
  fetchedAt: Date | null;
}

const WITHHELD_TITLES = {
  import: "Décompte officiel par groupe pas encore disponible",
  unreliable: "Décompte officiel par groupe non affiché",
} as const;

const POSITION_COLOR: Record<GroupPosition, string> = {
  POUR: "var(--vote-pour)",
  CONTRE: "var(--vote-contre)",
  ABSTENTION: "var(--vote-abstention)",
};

const COUNT_COLUMNS: { label: string; color: string | null }[] = [
  { label: "Pour", color: POSITION_COLOR.POUR },
  { label: "Contre", color: POSITION_COLOR.CONTRE },
  { label: "Abstentions", color: POSITION_COLOR.ABSTENTION },
  { label: "Non-votants", color: null },
];

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

/**
 * The majority position as the source labels it, never one PoliGraph derives from the counts.
 * The text stays in the foreground colour on a light tint: the vote colours alone do not reach
 * 4.5:1 as text. `labelled` writes « Position majoritaire » for screen readers where no column
 * header already says it.
 */
function MajorityBadge({
  position,
  labelled = true,
  className,
}: {
  position: GroupPosition;
  labelled?: boolean;
  className?: string;
}) {
  const color = POSITION_COLOR[position];
  return (
    <span
      data-majority={position}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className
      )}
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {labelled ? <span className="sr-only">Position majoritaire : </span> : null}
      {GROUP_POSITION_LABELS[position]}
    </span>
  );
}

/** A zero is dimmed so the positions a group actually took stand out in the column. */
function CountCell({ count }: { count: number | null }) {
  return (
    <td
      className={cn(
        "px-2 py-2.5 text-right align-top tabular-nums",
        count === 0 || count === null ? "text-muted-foreground" : "font-semibold"
      )}
    >
      {count ?? ""}
    </td>
  );
}

/**
 * Bloc C1 de la page de scrutin : le décompte par groupe publié par l'institution, nommé avec les
 * libellés du référentiel officiel. Masqué avec sa raison quand il ne peut pas être garanti, et le
 * lien vers la source reste toujours accessible.
 */
export function ScrutinOfficialGroups({ view, source, fetchedAt }: ScrutinOfficialGroupsProps) {
  const sourceLink = source ? (
    <SourceLine sources={[{ label: source.label, url: source.url }]} className="mt-2" />
  ) : null;

  if (view.kind === "not-imported") {
    return (
      <MissingData title="Décompte officiel par groupe pas encore importé" className="mb-8">
        L&apos;Assemblée nationale publie ce décompte avec chaque scrutin. PoliGraph ne l&apos;a pas
        encore repris pour celui-ci.
        {sourceLink}
      </MissingData>
    );
  }

  if (view.kind === "withheld") {
    return (
      <MissingData title={WITHHELD_TITLES[view.origin]} className="mb-8">
        <p>{view.reason}</p>
        {view.detail ? <p className="mt-1">{view.detail}</p> : null}
        {sourceLink}
      </MissingData>
    );
  }

  return (
    // The Card already pads itself (`py-6`): no extra top padding on the content.
    <Card className="mb-8">
      <CardContent>
        <h3 className="text-base font-semibold">Décompte officiel par groupe</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Décompte publié avec le scrutin. Chaque groupe porte le libellé du référentiel officiel de
          l&apos;Assemblée nationale.
        </p>
        {/* Mobile: one block per group, so no column is hidden behind a horizontal scroll. */}
        <ul className="mt-3 divide-y sm:hidden" aria-label="Décompte officiel par groupe">
          {view.rows.map((row) => (
            <li key={row.organeRef} className="py-4 first:pt-1 last:pb-1">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{groupName(row)}</p>
                {row.majorityPosition ? (
                  <MajorityBadge position={row.majorityPosition} className="mt-0.5" />
                ) : null}
              </div>
              <PositionCountBar
                forCount={row.forCount}
                againstCount={row.againstCount}
                abstainCount={row.abstainCount}
                className="mt-2 h-2.5"
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
        <div
          className="mt-3 hidden overflow-x-auto sm:block"
          role="region"
          aria-label="Décompte officiel par groupe"
          tabIndex={0}
        >
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">
              Pour, contre, abstentions et non-votants de chaque groupe, tels que publiés.
            </caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Groupe
                </th>
                {COUNT_COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className="px-2 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {column.color ? (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: column.color }}
                        />
                      ) : null}
                      {column.label}
                    </span>
                  </th>
                ))}
                <th scope="col" className="py-2 pl-3 font-medium">
                  Position majoritaire
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.organeRef} className="border-b last:border-0">
                  <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                    {groupName(row)}
                    <PositionCountBar
                      forCount={row.forCount}
                      againstCount={row.againstCount}
                      abstainCount={row.abstainCount}
                      className="mt-1.5 max-w-xs"
                    />
                  </th>
                  <CountCell count={row.forCount} />
                  <CountCell count={row.againstCount} />
                  <CountCell count={row.abstainCount} />
                  <CountCell count={row.nonVoterCount} />
                  <td className="py-2.5 pl-3 align-top">
                    {row.majorityPosition ? (
                      <MajorityBadge position={row.majorityPosition} labelled={false} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceLine
          sources={source ? [{ label: source.label, url: source.url }] : []}
          consultedAt={fetchedAt}
          note="Position majoritaire : libellé de la source"
          className="mt-3"
        />
      </CardContent>
    </Card>
  );
}
