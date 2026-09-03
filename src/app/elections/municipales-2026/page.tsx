import { cache, Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitionIndex } from "@/components/elections/municipales/CompetitionIndex";
import { MunicipalesHero } from "@/components/elections/municipales/MunicipalesHero";
import { MunicipalesChiffres } from "@/components/elections/municipales/MunicipalesChiffres";
import { CommuneSearch } from "@/components/elections/municipales/CommuneSearch";
import { ELECTION_GUIDES } from "@/config/election-guides";
import {
  getDepartmentPartyData,
  getMunicipalesStats,
  getResultatsStats,
} from "@/lib/data/municipales";
import { PartyMap } from "@/components/elections/municipales/PartyMap";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";

export const revalidate = 300; // ISR: 5 minutes

const getElection = cache(async function getElection() {
  return db.election.findUnique({
    where: { slug: "municipales-2026" },
    select: {
      id: true,
      round1Date: true,
      round2Date: true,
      dateConfirmed: true,
      title: true,
    },
  });
});

export const metadata: Metadata = {
  title: "Municipales 2026 — Candidats, listes et résultats",
  description:
    "Découvrez les candidats et listes aux élections municipales 2026 dans votre commune. Recherche par ville, carte des forces politiques, parité et cumul des mandats.",
  openGraph: {
    title: "Municipales 2026 — Qui se présente chez vous ?",
    description: "Découvrez les candidats aux élections municipales 2026 dans votre commune.",
  },
  alternates: { canonical: "/elections/municipales-2026" },
};

async function PartyMapSection() {
  const departmentData = await getDepartmentPartyData();
  if (departmentData.length === 0) return null;

  return (
    <section className="py-8">
      <h2 className="text-xl font-bold mb-4">Cartographie politique</h2>
      <div className="border rounded-xl overflow-hidden bg-card p-4">
        <PartyMap departments={departmentData} mini />
      </div>
      <div className="mt-3 text-right">
        <Link
          href="/elections/municipales-2026/carte"
          prefetch={false}
          className="text-sm text-primary hover:underline"
        >
          Voir la carte complète →
        </Link>
      </div>
    </section>
  );
}

function PartyMapFallback() {
  return (
    <section className="py-8">
      <Skeleton className="h-6 w-56 mb-4" />
      <Skeleton className="h-[300px] w-full rounded-xl" />
    </section>
  );
}

export default async function MunicipalesLandingPage() {
  const election = await getElection();
  const [stats, resultats] = await Promise.all([getMunicipalesStats(), getResultatsStats()]);

  // Countdown: T1 → T2 → hidden once both rounds are passed
  const now = new Date();
  const round1Passed = election?.round1Date && election.round1Date < now;
  const round2Passed = election?.round2Date && election.round2Date < now;
  const targetDate = round2Passed
    ? null
    : round1Passed && election?.round2Date
      ? election.round2Date.toISOString()
      : election?.round1Date
        ? election.round1Date.toISOString()
        : null;
  const countdownLabel = round1Passed ? "2nd tour dans" : "1er tour dans";

  const guides = ELECTION_GUIDES.MUNICIPALES;

  return (
    <div className="container mx-auto px-4 max-w-6xl">
      <CollectionPageJsonLd
        name="Municipales 2026"
        description="Découvrez les candidats et listes aux élections municipales 2026 dans votre commune. Recherche par ville, carte des forces politiques, parité et cumul des mandats."
        url="https://poligraph.fr/elections/municipales-2026"
        numberOfItems={stats?.totalCandidacies ?? 0}
      />
      <Breadcrumb
        items={[{ label: "Élections", href: "/elections" }, { label: "Municipales 2026" }]}
      />

      {/* Hero */}
      <section className="py-4">
        <MunicipalesHero
          targetDate={targetDate}
          dateConfirmed={election?.dateConfirmed ?? false}
          totalCandidacies={stats?.totalCandidacies ?? 0}
          totalCommunes={stats?.totalCommunes ?? 0}
          totalLists={stats?.totalLists ?? 0}
          countdownLabel={countdownLabel}
        />
      </section>

      {/* Search */}
      <section className="py-8">
        <CommuneSearch />
      </section>

      {/* Chiffres */}
      {stats && (
        <section className="py-8">
          <h2 className="text-xl font-bold mb-4">Les chiffres clés</h2>
          <MunicipalesChiffres
            communesWithCompetition={stats.communesWithCompetition}
            totalCommunes={stats.totalCommunes}
            averageCompetitionIndex={stats.averageCompetitionIndex}
            parityRate={stats.parityRate}
            nationalPoliticiansCandidates={stats.nationalPoliticiansCandidates}
            round2Date={election?.round2Date?.toISOString() ?? null}
            electionCompleted={!!round2Passed}
            resultats={resultats}
          />
        </section>
      )}

      {/* Most contested communes */}
      {stats && stats.mostContestedCommunes.length > 0 && (
        <section className="py-8">
          <h2 className="text-xl font-bold mb-4">
            Les communes où la compétition est la plus forte
          </h2>
          <p className="text-muted-foreground mb-6">Classées par nombre de listes déposées</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.mostContestedCommunes.map((commune) => (
              <Link
                key={commune.id}
                href={`/elections/municipales-2026/communes/${commune.id}`}
                prefetch={false}
              >
                <Card className="hover:shadow-sm hover:border-primary/50 hover:-translate-y-0.5 transition-all h-full">
                  <CardContent className="pt-5">
                    <p className="font-semibold">{commune.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{commune.departmentCode}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline">{commune.listCount} listes</Badge>
                      <CompetitionIndex
                        listCount={commune.listCount}
                        population={commune.population}
                      />
                      {commune.population && (
                        <span className="text-xs text-muted-foreground">
                          {commune.population.toLocaleString("fr-FR")} hab.
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Cross-links */}
      <section className="py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/elections/municipales-2026/maires" prefetch={false}>
            <Card className="hover:shadow-sm hover:border-primary/50 hover:-translate-y-0.5 transition-all h-full">
              <CardContent className="pt-5">
                <h3 className="font-semibold mb-1">Annuaire des maires</h3>
                <p className="text-sm text-muted-foreground">
                  Explorez les 35 000 maires de France : parité, couleur politique, ancienneté.
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/elections/municipales-2026/cumul" prefetch={false}>
            <Card className="hover:shadow-sm hover:border-primary/50 hover:-translate-y-0.5 transition-all h-full">
              <CardContent className="pt-5">
                <h3 className="font-semibold mb-1">Cumul des mandats</h3>
                <p className="text-sm text-muted-foreground">
                  Députés, sénateurs et ministres candidats aux municipales 2026.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Cartographie politique — streamed independently (heavy query) */}
      <Suspense fallback={<PartyMapFallback />}>
        <PartyMapSection />
      </Suspense>

      {/* Uncontested communes */}
      {stats && stats.communesUncontested > 0 && (
        <section className="py-8">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-2">Communes sans choix</h2>
            <p className="text-muted-foreground">
              <span className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {stats.communesUncontested.toLocaleString("fr-FR")}
              </span>{" "}
              communes n&apos;ont qu&apos;une seule liste en lice. Les électeurs n&apos;auront pas
              de choix entre des candidatures concurrentes.
            </p>
          </div>
        </section>
      )}

      {/* Guide pratique */}
      {guides && (
        <section className="py-8">
          <h2 className="text-xl font-bold mb-4">Guide pratique</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {guides.map((guide) => (
              <Card key={guide.title}>
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0" aria-hidden="true">
                      {guide.icon}
                    </span>
                    <div>
                      <h3 className="font-semibold mb-1">{guide.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {guide.content}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
