import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { LegislatureTimeline } from "@/components/parlement/legislature";
import { ROUTES } from "@/config/routes";
import {
  COVERAGE_LEVEL_LABELS,
  LEGISLATURE_NUMBERS,
  coverageToStatus,
  datasetLevel,
  getLegislatureView,
  ordinalLegislature,
} from "@/lib/parlement/legislature-labels";

export const revalidate = 86400;

const DESCRIPTION =
  "Les 15e, 16e et 17e législatures de l'Assemblée nationale : dates, nombre de sièges, sources et état des données disponibles dans PoliGraph.";

export const metadata: Metadata = {
  title: "Les législatures de l'Assemblée nationale",
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.legislatures },
};

export default function LegislaturesPage() {
  const views = LEGISLATURE_NUMBERS.map((n) => getLegislatureView(n)).filter(
    (v): v is NonNullable<typeof v> => v !== null
  );
  const openingYear = (v: (typeof views)[number]) =>
    Number(v.facts.dates.find((d) => d.kind === "opening-sitting")!.date.slice(0, 4));
  const endYear = (v: (typeof views)[number]) => {
    if (v.facts.status === "ongoing") return null;
    const end =
      v.facts.dates.find((d) => d.kind === "archive-end") ??
      v.facts.dates.find((d) => d.kind === "powers-expiry");
    return end ? Number(end.date.slice(0, 4)) : null;
  };
  const current = views.find((v) => v.facts.status === "ongoing")?.facts.number;

  const timelineItems = views.map((v) => ({
    number: v.facts.number,
    startYear: openingYear(v),
    endYear: endYear(v),
    startEvent: v.facts.endCause === "dissolution" ? "Terminée par une dissolution" : undefined,
    status: coverageToStatus(datasetLevel(v.coverage, "scrutins")),
    statusLabel: COVERAGE_LEVEL_LABELS[datasetLevel(v.coverage, "scrutins")],
    statusScope: "Scrutins publics",
    href: ROUTES.legislature(v.facts.number),
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <CollectionPageJsonLd
        name="Les législatures de l'Assemblée nationale"
        description={DESCRIPTION}
        url={`https://poligraph.fr${ROUTES.legislatures}`}
        numberOfItems={views.length}
      />
      <Breadcrumb
        items={[
          { label: "Parlement", href: ROUTES.parlement },
          { label: "Législatures de l'Assemblée nationale" },
        ]}
      />

      <div className="mb-8 max-w-3xl">
        <h1 className="mb-2 title-page">Les législatures de l&apos;Assemblée nationale</h1>
        <p className="text-muted-foreground">
          Une législature court de l&apos;élection des députés à la fin de leur mandat, par
          expiration des pouvoirs ou par dissolution. Choisissez-en une pour voir ses dates, ses
          sources et les données que PoliGraph a déjà importées.
        </p>
      </div>

      <section aria-labelledby="frise-titre" className="mb-10">
        <h2 id="frise-titre" className="mb-3 title-section">
          De 2017 à aujourd&apos;hui
        </h2>
        <LegislatureTimeline
          items={timelineItems}
          referenceYear={new Date().getFullYear()}
          current={current}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          La largeur des segments suit la durée des législatures. Le statut indiqué concerne les
          scrutins publics importés dans PoliGraph, pas la législature entière.
        </p>
      </section>

      <section aria-labelledby="cartes-titre" className="mb-10">
        <h2 id="cartes-titre" className="mb-3 title-section">
          Ce que nous avons pour chaque législature
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {[...views].reverse().map((v) => (
            <li key={v.facts.number} className="rounded-lg border bg-card p-4">
              <h3 className="title-card">
                <Link
                  href={ROUTES.legislature(v.facts.number)}
                  className="inline-flex min-h-11 items-center underline hover:text-primary"
                >
                  {ordinalLegislature(v.facts.number)} législature
                </Link>
              </h3>
              <p className="text-sm text-muted-foreground">
                {v.period}
                {v.facts.status === "ongoing" ? ", en cours" : ", terminée"}
              </p>
              <p className="mt-2 text-sm">
                {datasetLevel(v.coverage, "scrutins") === "absent"
                  ? "Scrutins et votes pas encore importés. Ce n'est pas une assemblée vide."
                  : "Scrutins et votes individuels importés, avec des limites détaillées sur la page."}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="avant-titre" className="mb-10 max-w-3xl space-y-4">
        <h2 id="avant-titre" className="sr-only">
          Limites de la couverture
        </h2>
        <MissingData title="Avant la 15e législature">
          PoliGraph ne couvre pas encore les législatures antérieures à 2017. Aucune donnée
          n&apos;est affichée, ce qui ne veut pas dire que l&apos;Assemblée n&apos;a pas siégé.
        </MissingData>
        <MissingData title="Comprendre les chiffres">
          Les sièges, les députés élus, les mandats successifs et les sièges pourvus à une date sont
          quatre notions différentes. Les 577 sièges sont un nombre légal, pas un nombre de députés
          ayant siégé.
        </MissingData>
      </section>

      <SourceLine
        sources={[
          { label: "Assemblée nationale", url: "https://www.assemblee-nationale.fr" },
          { label: "Légifrance", url: "https://www.legifrance.gouv.fr" },
        ]}
        consultedAt="2026-10-16"
        note="Détail des sources sur la page de chaque législature."
      />
    </div>
  );
}
