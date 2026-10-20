import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SourceLine } from "@/components/ui/SourceLine";
import { DataStatus } from "@/components/parlement/legislature";
import { DATA_SOURCE_LABELS } from "@/config/labels";
import { ordinalLegislature } from "@/lib/parlement/legislature-labels";
import type {
  ParliamentaryPathRow,
  PathDatesReason,
  PathMandate,
} from "@/lib/politicians/parliamentary-path";
import { formatDate } from "@/lib/utils";

interface ParliamentaryPathProps {
  rows: ParliamentaryPathRow[];
  slug: string;
  fullName: string;
}

const STATUS_SCOPE = "Dates du mandat";

function datesStatusCopy(row: ParliamentaryPathRow): { label: string; description: string } {
  const reason: PathDatesReason = row.datesStatus.reason;
  switch (reason) {
    case "CONSISTENT":
      return {
        label: "Concordantes",
        description: "Aucun vote enregistré en dehors des dates du mandat.",
      };
    case "NOT_CROSS_CHECKED":
      return {
        label: "Non recoupées",
        description:
          "Aucun vote importé pour cette législature : les dates n'ont pas pu être comparées.",
      };
    case "OVERLAPPING_MANDATES":
      return {
        label: "À vérifier",
        description: "Plusieurs mandats de député se chevauchent sur cette législature.",
      };
    case "VOTES_OUTSIDE_MANDATE":
      return {
        label: "À vérifier",
        description: "Des votes sont enregistrés en dehors des dates du mandat.",
      };
    case "NO_MANDATE":
      return row.mandates.length === 0
        ? {
            label: "Mandat non enregistré",
            description:
              "Des votes existent pour cette législature, mais aucun mandat de député ne la couvre.",
          }
        : {
            label: "À vérifier",
            description: "Le mandat enregistré ne couvre aucun scrutin de cette législature.",
          };
  }
}

function periodText(mandate: PathMandate): string {
  if (mandate.isCurrent) return `depuis le ${formatDate(mandate.startDate)}`;
  if (mandate.endDate) {
    return `du ${formatDate(mandate.startDate)} au ${formatDate(mandate.endDate)}`;
  }
  return `à partir du ${formatDate(mandate.startDate)}, fin non renseignée`;
}

function constituencies(row: ParliamentaryPathRow): string[] {
  return [...new Set(row.mandates.map((m) => m.constituency).filter((c): c is string => !!c))];
}

function MandateCell({ row }: { row: ParliamentaryPathRow }) {
  if (row.mandates.length === 0) {
    return <span className="text-muted-foreground">Mandat non enregistré dans PoliGraph</span>;
  }
  return (
    <ul className="space-y-0.5">
      {row.mandates.map((mandate) => (
        <li key={mandate.id}>{periodText(mandate)}</li>
      ))}
    </ul>
  );
}

function ConstituencyCell({ row }: { row: ParliamentaryPathRow }) {
  const names = constituencies(row);
  if (names.length === 0) return <span className="text-muted-foreground">Non renseignée</span>;
  return <>{names.join(" ; ")}</>;
}

function VotesCell({
  row,
  slug,
  fullName,
}: {
  row: ParliamentaryPathRow;
  slug: string;
  fullName: string;
}) {
  if (row.votes) {
    const label = `${row.votes.total.toLocaleString("fr-FR")} ${row.votes.total > 1 ? "votes" : "vote"}`;
    return (
      <Link
        href={`/politiques/${slug}/votes?legislature=${row.legislature}`}
        className="inline-flex min-h-[44px] items-center text-primary underline underline-offset-2 hover:no-underline"
        aria-label={`Voir les ${label} de ${fullName} pendant la ${ordinalLegislature(row.legislature)} législature`}
      >
        {label}
      </Link>
    );
  }
  return (
    <span className="text-muted-foreground">
      {row.votesImported
        ? "Aucun vote enregistré"
        : "Votes non importés pour cette législature. Ce n'est pas une absence de votes."}
    </span>
  );
}

function StatusCell({ row }: { row: ParliamentaryPathRow }) {
  const copy = datesStatusCopy(row);
  return (
    <DataStatus
      status={row.datesStatus.kind}
      scope={STATUS_SCOPE}
      label={copy.label}
      description={copy.description}
    />
  );
}

function sourcesOf(rows: ParliamentaryPathRow[]) {
  const mandates = rows.flatMap((row) => row.mandates);
  const labels = [
    ...new Set(mandates.flatMap((m) => (m.source ? [DATA_SOURCE_LABELS[m.source]] : []))),
  ];
  const confirmed = mandates
    .map((m) => m.lastConfirmedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  return {
    sources: (labels.length > 0 ? labels : ["Mandats enregistrés dans PoliGraph"]).map((label) => ({
      label,
    })),
    consultedAt: confirmed[0] ?? null,
  };
}

/**
 * ParliamentaryPath : les législatures de l'Assemblée nationale où un mandat de député ou des
 * votes sont enregistrés pour cette personne, avec l'accès aux votes de chacune.
 *
 * Rien n'est déduit : ni groupe, ni parti, ni continuité entre législatures. Une législature
 * absente n'est pas une absence de mandat. Deux présentations du même contenu, une seule
 * visible à la fois (tableau dès 640 px, cartes en dessous).
 */
export function ParliamentaryPath({ rows, slug, fullName }: ParliamentaryPathProps) {
  if (rows.length === 0) return null;
  const { sources, consultedAt } = sourcesOf(rows);
  const caption = `Parcours parlementaire de ${fullName}`;

  return (
    <Card>
      <CardHeader>
        <h2 className="leading-none font-semibold">Parcours parlementaire</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Législatures de l&apos;Assemblée nationale où un mandat de député ou des votes sont
          enregistrés. Une législature qui ne figure pas ici n&apos;est pas la preuve d&apos;une
          absence de mandat.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="hidden sm:block">
          <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
            <table className="w-full text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Législature
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Mandat de député
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Circonscription
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Votes enregistrés
                  </th>
                  <th scope="col" className="py-2 pl-3 font-medium">
                    Dates du mandat
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.legislature} className="border-b align-top last:border-0">
                    <th scope="row" className="py-3 pr-3 text-left font-medium">
                      {ordinalLegislature(row.legislature)} législature
                      <span className="block text-xs font-normal text-muted-foreground">
                        {row.period}
                      </span>
                    </th>
                    <td className="px-3 py-3">
                      <MandateCell row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <ConstituencyCell row={row} />
                    </td>
                    <td className="px-3 py-1">
                      <VotesCell row={row} slug={slug} fullName={fullName} />
                    </td>
                    <td className="py-3 pl-3">
                      <StatusCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="space-y-3 sm:hidden" aria-label={caption}>
          {rows.map((row) => (
            <li key={row.legislature} className="rounded-lg border p-3">
              <p className="font-medium">
                {ordinalLegislature(row.legislature)} législature
                <span className="ml-2 text-xs font-normal text-muted-foreground">{row.period}</span>
              </p>
              <dl className="mt-2 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Mandat de député</dt>
                  <dd>
                    <MandateCell row={row} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Circonscription</dt>
                  <dd>
                    <ConstituencyCell row={row} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Votes enregistrés</dt>
                  <dd>
                    <VotesCell row={row} slug={slug} fullName={fullName} />
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Dates du mandat</dt>
                  <dd>
                    <StatusCell row={row} />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <SourceLine sources={sources} consultedAt={consultedAt} />
      </CardContent>
    </Card>
  );
}
