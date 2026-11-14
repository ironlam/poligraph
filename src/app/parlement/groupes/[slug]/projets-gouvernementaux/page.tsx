import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { GOVERNMENT_PROJECT_EXCLUSION_LABELS } from "@/config/labels";
import { ROUTES } from "@/config/routes";
import {
  getGovernmentProjectPositionsForGroup,
  type GovernmentProjectPositionRow,
} from "@/lib/data/government-project-positions";
import { getGroupeDetail } from "@/lib/data/groupes";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { governmentProjectTitleParts } from "@/lib/votes/government-project-title";
import { GroupMonogram } from "@/components/groupes/GroupCard";
import { PositionShareBar } from "@/components/groupes/GovernmentProjectPositionBreakdown";
import { GovernmentProjectRowsFilter } from "@/components/groupes/GovernmentProjectRowsFilter";
import { ExternalLink, Info } from "lucide-react";

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupeDetail(slug);
  if (!group || group.chamber !== "AN" || group.code === "NI") {
    return missingEntityMetadata("Groupe non trouvé");
  }
  return {
    title: "Projets gouvernementaux : " + group.name,
    description:
      "Scrutins retenus et exclus pour les positions de " +
      group.name +
      " sur les projets gouvernementaux.",
    alternates: { canonical: ROUTES.groupeGovernmentProjects(slug) },
  };
}

const POSITION_STYLE = {
  POUR: { label: "Pour", dot: "var(--vote-pour)" },
  ABSTENTION: { label: "Abstention", dot: "var(--vote-abstention)" },
  CONTRE: { label: "Contre", dot: "var(--vote-contre)" },
} as const;

function dateParts(date: Date) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("fr-FR", { ...options, timeZone: "Europe/Paris" });
  const day = format({ day: "numeric" });
  return {
    day: day === "1" ? "1er" : day,
    month: format({ month: "short" }),
    year: format({ year: "numeric" }),
    full: format({ day: "numeric", month: "long", year: "numeric" }),
  };
}

function ScrutinRow({ row }: { row: GovernmentProjectPositionRow }) {
  const date = dateParts(row.scrutin.votingDate);
  const { bill, reading } = governmentProjectTitleParts(row.scrutin.title);
  const rawType = row.scrutin.libelleTypeVote ?? row.scrutin.codeTypeVote;
  const typeLabel = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : null;
  const position = row.position ? POSITION_STYLE[row.position] : null;
  const counts = {
    POUR: row.forCount ?? 0,
    ABSTENTION: row.abstainCount ?? 0,
    CONTRE: row.againstCount ?? 0,
  };
  const voters = counts.POUR + counts.ABSTENTION + counts.CONTRE;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-3 p-4 sm:px-5">
      <p className="flex w-12 shrink-0 flex-col items-center pt-0.5 leading-tight">
        <span className="sr-only">{date.full}</span>
        <span aria-hidden="true" className="font-display text-xl font-extrabold">
          {date.day}
        </span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {date.month}
          {position ? "" : ` ${date.year}`}
        </span>
      </p>

      <div className="flex min-w-0 grow basis-52 flex-col gap-1.5">
        {row.scrutin.slug ? (
          <Link
            href={ROUTES.voteDetail(row.scrutin.slug)}
            prefetch={false}
            className="inline-flex min-h-11 items-center font-semibold leading-snug hover:underline"
          >
            {bill}
          </Link>
        ) : (
          <span className="font-semibold leading-snug">{bill}</span>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {reading && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-foreground">{reading}</span>
          )}
          {typeLabel && <span>{typeLabel}</span>}
          {row.dossier?.slug && (
            <Link
              href={ROUTES.dossierDetail(row.dossier.slug)}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Dossier législatif
            </Link>
          )}
          {row.scrutin.sourceUrl && (
            <a
              href={row.scrutin.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Voir le scrutin sur le site de l’Assemblée nationale, nouvelle fenêtre"
              className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
            >
              Source Assemblée nationale
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </div>
        {row.exclusion && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Motif : {GOVERNMENT_PROJECT_EXCLUSION_LABELS[row.exclusion]}</span>
          </p>
        )}
      </div>

      {position && (
        <div className="flex grow basis-44 flex-col gap-1.5 max-sm:ml-17 sm:max-w-56">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 text-sm font-semibold">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: position.dot }}
            />
            {position.label}
          </span>
          <PositionShareBar values={counts} className="h-1.5" />
          <span className="text-xs text-muted-foreground">
            {counts.POUR} pour · {counts.ABSTENTION} abst. · {counts.CONTRE} contre ({voters} votant
            {voters > 1 ? "s" : ""})
          </span>
        </div>
      )}
    </div>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

export default async function GovernmentProjectsPage({ params }: PageProps) {
  const { slug } = await params;
  const group = await getGroupeDetail(slug);
  if (!group || group.chamber !== "AN" || group.code === "NI") notFound();

  const data = await getGovernmentProjectPositionsForGroup(group.code);
  if (!data) notFound();
  const retained = data.rows.filter((row) => row.position !== null);
  const excluded = data.rows.filter((row) => row.position === null);
  const { counts, percentages, updatedAt } = data.summary;
  const share = (value: number | null) => (value === null ? "" : ` (${Math.round(value)} %)`);

  return (
    <main>
      <div className="border-b bg-card">
        <div
          aria-hidden="true"
          className="h-2"
          style={{ backgroundColor: group.color ?? "#a6a6a6" }}
        />
        <div className="container mx-auto max-w-4xl px-4 pb-7 pt-5">
          <Breadcrumb
            items={[
              { label: "Parlement", href: ROUTES.parlement },
              { label: "Groupes", href: ROUTES.groupes },
              { label: group.name, href: ROUTES.groupeDetail(slug) },
              { label: "Projets gouvernementaux" },
            ]}
          />

          <div className="flex items-center gap-4">
            <GroupMonogram
              code={group.code}
              color={group.color}
              className="h-14 min-w-14 rounded-xl px-2 text-base"
            />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                <Link
                  href={ROUTES.groupeDetail(slug)}
                  className="inline-flex min-h-11 items-center hover:underline"
                >
                  {group.name}
                </Link>{" "}
                · {plural(group.seatCount, "député")}
              </p>
              <h1 className="mt-0.5 text-2xl font-display font-extrabold leading-tight tracking-tight sm:text-3xl">
                Positions sur les projets gouvernementaux
              </h1>
            </div>
          </div>

          {retained.length > 0 && (
            <div className="mt-6 flex flex-col gap-3">
              <PositionShareBar values={percentages} className="h-4" />
              <p className="text-base sm:text-lg">
                Sur{" "}
                <strong>
                  {plural(retained.length, "scrutin")} retenu{retained.length > 1 ? "s" : ""}
                </strong>
                , le groupe a voté pour {counts.POUR} fois{share(percentages.POUR)}, s{"'"}est
                abstenu {counts.ABSTENTION} fois{share(percentages.ABSTENTION)} et a voté contre{" "}
                {counts.CONTRE} fois{share(percentages.CONTRE)}.
              </p>
              <p className="text-sm text-muted-foreground">
                {excluded.length > 0
                  ? `${excluded.length > 1 ? `${excluded.length} autres scrutins écartés` : "1 autre scrutin écarté"}, avec le motif en bas de page. `
                  : ""}
                {updatedAt &&
                  `Sources récupérées le ${updatedAt.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "Europe/Paris",
                  })}.`}
              </p>
            </div>
          )}

          <details className="mt-5 rounded-xl border bg-background">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">
              Comment lire cette page
            </summary>
            <div className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
              <p>
                Chaque ligne correspond à un vote sur l{"'"}ensemble d{"'"}un projet de loi d{"'"}
                origine gouvernementale. Plusieurs lectures du même projet comptent séparément. La
                position du groupe est celle de la majorité de ses votants.
              </p>
              <p>
                Le type officiel du scrutin (solennel ou ordinaire) est affiché mais ne filtre pas
                la liste.{" "}
                <Link
                  href={ROUTES.governmentProjectsMethodology}
                  className="inline-flex min-h-11 items-center text-primary underline underline-offset-2"
                >
                  Lire la méthodologie complète
                </Link>
              </p>
            </div>
          </details>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <section aria-labelledby="retained-title">
          <h2 id="retained-title" className="mb-4 font-display text-xl font-bold sm:text-2xl">
            Positions retenues ({retained.length})
          </h2>
          {retained.length > 0 ? (
            <GovernmentProjectRowsFilter
              rows={retained.map((row) => ({
                key: row.scrutin.externalId,
                position: row.position!,
                year: dateParts(row.scrutin.votingDate).year,
                node: <ScrutinRow row={row} />,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune position calculable.</p>
          )}
        </section>

        {excluded.length > 0 && (
          <section className="mt-12" aria-labelledby="excluded-title">
            <h2 id="excluded-title" className="font-display text-xl font-bold sm:text-2xl">
              Scrutins écartés ({excluded.length})
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ces scrutins candidats ne contribuent à aucune des trois parts affichées.
            </p>
            <ol className="mt-4 overflow-hidden rounded-xl border border-dashed bg-card">
              {excluded.map((row) => (
                <li
                  key={row.scrutin.externalId}
                  className="border-t border-dashed first:border-t-0"
                >
                  <ScrutinRow row={row} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
