import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompetitionIndex } from "@/components/elections/municipales/CompetitionIndex";
import { CommuneSearch } from "@/components/elections/municipales/CommuneSearch";
import { DEPARTMENTS } from "@/config/departments";
import { getDepartmentMunicipales } from "@/lib/data/municipales";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const dept = DEPARTMENTS[code];
  if (!dept) return {};
  return {
    title: `Municipales 2026 en ${dept.name} - Communes, listes et candidats`,
    description: `Découvrez les candidats aux élections municipales 2026 dans le département ${dept.name} (${code}). Listes, maires sortants et indices de compétition.`,
    alternates: { canonical: `/elections/municipales-2026/departements/${code}` },
  };
}

export default async function DepartmentMunicipalesPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const dept = DEPARTMENTS[code];
  if (!dept) notFound();

  const sp = await searchParams;
  const rawPage = parseInt(sp.page || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const data = await getDepartmentMunicipales(code, page);
  if (!data) notFound();

  const { communes, total, totalPages, stats, participation } = data;

  function buildUrl(pageNum: number) {
    const p = new URLSearchParams();
    if (pageNum > 1) p.set("page", String(pageNum));
    const qs = p.toString();
    return `/elections/municipales-2026/departements/${code}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="container mx-auto px-4 max-w-6xl">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Municipales 2026", href: "/elections/municipales-2026" },
          { label: dept.name },
        ]}
      />

      {/* Header */}
      <section className="py-4">
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
          Municipales 2026 en {dept.name} ({code})
        </h1>
        <p className="text-muted-foreground">
          {total.toLocaleString("fr-FR")} commune{total > 1 ? "s" : ""} avec des listes déposées
        </p>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <Card>
            <CardContent className="pt-5">
              <div className="text-3xl font-display font-extrabold tracking-tight text-primary tabular-nums">
                {stats.totalCommunes.toLocaleString("fr-FR")}
              </div>
              <div className="text-sm font-medium mt-0.5">Communes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-3xl font-display font-extrabold tracking-tight text-primary tabular-nums">
                {stats.totalLists.toLocaleString("fr-FR")}
              </div>
              <div className="text-sm font-medium mt-0.5">Listes déposées</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-3xl font-display font-extrabold tracking-tight text-primary tabular-nums">
                {stats.avgCompetition.toFixed(1)}
              </div>
              <div className="text-sm font-medium mt-0.5">Listes par commune (moy.)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-3xl font-display font-extrabold tracking-tight text-primary tabular-nums">
                {(stats.parityRate * 100).toFixed(1)}%
              </div>
              <div className="text-sm font-medium mt-0.5">Candidates</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Results participation */}
      {participation && participation.communesDepouillees > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline">
              {participation.communesDepouillees} communes dépouillées
            </Badge>
            {participation.avgParticipation != null && (
              <span className="text-muted-foreground">
                Participation : {participation.avgParticipation.toFixed(1)} %
              </span>
            )}
          </div>
        </section>
      )}

      {/* Commune search */}
      <section className="py-6">
        <CommuneSearch departmentFilter={code} />
      </section>

      {/* Commune grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
        {communes.map((commune) => (
          <Link
            key={commune.id}
            href={`/elections/municipales-2026/communes/${commune.id}`}
            prefetch={false}
          >
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{commune.name}</h2>
                    {commune.population != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {commune.population.toLocaleString("fr-FR")} hab.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className="tabular-nums">
                      {commune.listCount} liste{commune.listCount > 1 ? "s" : ""}
                    </Badge>
                    <CompetitionIndex
                      listCount={commune.listCount}
                      population={commune.population}
                    />
                  </div>
                </div>
                {commune.hasElected && (
                  <Badge className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                    Élu T1 · {Number(commune.winnerPct).toFixed(1)} %
                  </Badge>
                )}
                {!commune.hasElected && commune.topPct != null && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    T2 · En tête : {Number(commune.topPct).toFixed(1)} %
                  </Badge>
                )}
                {commune.maireName && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Maire sortant{commune.maireGender === "F" ? "e" : ""} : {commune.maireName}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      {communes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Aucune commune trouvée pour ce département.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-8 mb-12 flex justify-center items-center gap-2" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={buildUrl(page - 1)}
              className="inline-flex items-center gap-1 px-4 py-2 border rounded-md hover:bg-muted transition-colors text-sm"
              prefetch={false}
            >
              Précédent
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-4 py-2 border rounded-md opacity-50 cursor-not-allowed text-sm">
              Précédent
            </span>
          )}
          <span className="px-4 py-2 text-sm text-muted-foreground tabular-nums">
            Page <span className="font-medium text-foreground">{page}</span> sur{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </span>
          {page < totalPages ? (
            <Link
              href={buildUrl(page + 1)}
              className="inline-flex items-center gap-1 px-4 py-2 border rounded-md hover:bg-muted transition-colors text-sm"
              prefetch={false}
            >
              Suivant
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 px-4 py-2 border rounded-md opacity-50 cursor-not-allowed text-sm">
              Suivant
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
