import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import {
  CoverageTable,
  LegislatureDates,
  LegislatureSelector,
} from "@/components/parlement/legislature";
import { ROUTES } from "@/config/routes";
import type { LegislatureFacts } from "@/lib/parlement/legislature-types";
import { legislatureRobotsMetadata } from "@/lib/seo/legislature-robots";
import { staleDatasets } from "@/lib/parlement/legislature-config";
import { formatIsoDateFr } from "@/lib/parlement/format-iso-date";
import {
  COVERAGE_LEVEL_LABELS,
  LEGISLATURE_NUMBERS,
  coverageToStatus,
  datasetLevel,
  getLegislatureView,
  hasVotesData,
  ordinalLegislature,
  parseLegislatureParam,
} from "@/lib/parlement/legislature-labels";

export const revalidate = 86400;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ n: string }>;
}

export function generateStaticParams() {
  return LEGISLATURE_NUMBERS.map((n) => ({ n: String(n) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { n } = await params;
  const number = parseLegislatureParam(n);
  const view = number === null ? null : getLegislatureView(number);
  if (!view) return { title: "Législature introuvable", robots: { index: false, follow: false } };
  const label = `${ordinalLegislature(view.facts.number)} législature de l'Assemblée nationale`;
  return {
    title: `${label} (${view.period})`,
    description: `${label} : dates sourcées, nombre légal de sièges et état des données importées dans PoliGraph.`,
    alternates: { canonical: ROUTES.legislature(view.facts.number) },
    ...legislatureRobotsMetadata(view.coverage),
  };
}

/** Première séance sourcée de la législature, ou `null` si la configuration n'en porte pas. */
function openingSittingDate(facts: LegislatureFacts): string | null {
  return facts.dates.find((d) => d.kind === "opening-sitting")?.date ?? null;
}

function summarySentence(
  number: number,
  period: string,
  status: "ended" | "ongoing",
  cause: "powers-expiry" | "dissolution" | null,
  openingSitting: string | null
): string {
  const label = `La ${ordinalLegislature(number)} législature de l'Assemblée nationale`;
  if (status === "ongoing") {
    return openingSitting
      ? `${label} est en cours. Sa première séance a eu lieu le ${formatIsoDateFr(openingSitting)}.`
      : `${label} est en cours.`;
  }
  const end =
    cause === "dissolution"
      ? "par une dissolution"
      : "par l'expiration des pouvoirs de l'Assemblée";
  return `${label} s'est déroulée de ${period.replace("-", " à ")} et s'est terminée ${end}.`;
}

export default async function LegislaturePage({ params }: PageProps) {
  const { n } = await params;
  const number = parseLegislatureParam(n);
  const view = number === null ? null : getLegislatureView(number);
  if (!view) notFound();

  const { facts, coverage } = view;
  const label = `${ordinalLegislature(facts.number)} législature`;
  const stale = staleDatasets(coverage, new Date());
  const publicNotes = facts.contradictions.flatMap((c) => (c.publicNote ? [c.publicNote] : []));
  const votesLevel = datasetLevel(coverage, "scrutins");
  const consulted = view.sources
    .map((s) => s.consultedAt)
    .sort()
    .at(-1);
  const selectorOptions = LEGISLATURE_NUMBERS.map((k) => {
    const other = getLegislatureView(k)!;
    return {
      number: k,
      period: other.period,
      href: ROUTES.legislature(k),
      status: coverageToStatus(datasetLevel(other.coverage, "scrutins")),
      statusLabel: COVERAGE_LEVEL_LABELS[datasetLevel(other.coverage, "scrutins")],
      statusScope: "Scrutins publics",
    };
  });
  const ongoing = LEGISLATURE_NUMBERS.find(
    (k) => getLegislatureView(k)!.facts.status === "ongoing"
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Parlement", href: ROUTES.parlement },
          { label: "Législatures de l'Assemblée nationale", href: ROUTES.legislatures },
          { label },
        ]}
      />

      <LegislatureSelector options={selectorOptions} current={facts.number} className="mb-6" />

      <header className="mb-8 max-w-3xl">
        <h1 className="mb-2 title-page">{label} de l&apos;Assemblée nationale</h1>
        <p className="text-muted-foreground">
          {summarySentence(
            facts.number,
            view.period,
            facts.status,
            facts.endCause,
            openingSittingDate(facts)
          )}
        </p>
        {facts.status === "ended" && ongoing !== undefined && (
          <p className="mt-2 text-sm">
            Ce n&apos;est pas la composition actuelle. Pour l&apos;Assemblée
            d&apos;aujourd&apos;hui, voir la{" "}
            <Link href={ROUTES.legislature(ongoing)} className="underline hover:text-primary">
              {ordinalLegislature(ongoing)} législature
            </Link>
            .
          </p>
        )}
      </header>

      <section aria-labelledby="dates-titre" className="mb-10 max-w-3xl">
        <h2 id="dates-titre" className="mb-2 title-section">
          Dates de référence
        </h2>
        <LegislatureDates dates={view.displayDates} />
        {publicNotes.map((note) => (
          <p key={note} className="mt-3 text-sm text-muted-foreground">
            {note}
          </p>
        ))}
      </section>

      <section aria-labelledby="sieges-titre" className="mb-10 max-w-3xl">
        <h2 id="sieges-titre" className="mb-2 title-section">
          Sièges
        </h2>
        <p className="text-sm">
          <strong className="text-2xl font-display font-extrabold">{facts.seats.legalCount}</strong>{" "}
          sièges, fixés par l&apos;article LO 119 du code électoral.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          C&apos;est le nombre légal de sièges. Il ne dit ni combien de députés ont siégé,
          remplaçants compris, ni combien de sièges étaient pourvus à une date donnée.
        </p>
      </section>

      <section aria-labelledby="donnees-titre" className="mb-10">
        <h2 id="donnees-titre" className="mb-2 title-section">
          Données disponibles dans PoliGraph
        </h2>
        {coverage.navigation.absenceNotice && (
          <MissingData title="Données pas encore importées" className="mb-4 max-w-3xl">
            {coverage.navigation.absenceNotice}
          </MissingData>
        )}
        <CoverageTable coverage={coverage} caption={`Jeux de données de la ${label}`} />
        {stale.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Une partie de ces mesures date de plus de {coverage.refresh.maxAgeDays} jours : les
            chiffres ont pu évoluer depuis.
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Chaque jeu a son propre niveau : un jeu complet ne rendrait pas les autres complets.
        </p>
      </section>

      <section aria-labelledby="aller-titre" className="mb-10 max-w-3xl">
        <h2 id="aller-titre" className="mb-2 title-section">
          Aller plus loin
        </h2>
        {hasVotesData(coverage) ? (
          <p className="text-sm">
            <Link
              href={`${ROUTES.votes}?legislature=${facts.number}`}
              className="inline-flex min-h-11 items-center underline hover:text-primary"
            >
              Scrutins de la {label}
            </Link>
            {votesLevel === "partial" || votesLevel === "unverified"
              ? ", avec les limites indiquées ci-dessus."
              : "."}
          </p>
        ) : (
          <MissingData title="Scrutins non importés">
            Les scrutins de la {label} existent mais ne sont pas encore dans PoliGraph. Ce
            n&apos;est pas une absence de votes.
          </MissingData>
        )}
      </section>

      <SourceLine
        sources={view.sources.map((s) => ({ label: s.label, url: s.url }))}
        consultedAt={consulted}
        note="Les dates calculées le sont à partir des textes cités."
      />
    </div>
  );
}
