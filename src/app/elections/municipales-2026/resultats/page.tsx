import { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock } from "lucide-react";
import { DEPARTMENTS } from "@/config/departments";
import { getResultatsListing, getResultatsStats } from "@/lib/data/municipales";
import { CommuneSearch } from "@/components/elections/municipales/CommuneSearch";

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{ page?: string; dept?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const cp = new URLSearchParams();
  if (params.dept) cp.set("dept", params.dept);
  const qs = cp.toString();

  return {
    title: "Résultats - Municipales 2026",
    description:
      "Résultats des élections municipales 2026. Participation, listes élues et résultats par commune.",
    alternates: {
      canonical: `/elections/municipales-2026/resultats${qs ? `?${qs}` : ""}`,
    },
  };
}

function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default async function ResultatsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawPage = parseInt(sp.page || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const dept = sp.dept || undefined;
  const [data, stats] = await Promise.all([
    getResultatsListing({ page, dept }),
    getResultatsStats(),
  ]);

  if (!data) {
    return (
      <div className="container mx-auto px-4 max-w-6xl py-12 text-center">
        <p className="text-muted-foreground">Aucun résultat disponible pour le moment.</p>
      </div>
    );
  }

  const { communes, total, totalPages, round2Date } = data;
  const daysLeft = round2Date ? daysUntil(round2Date) : null;
  const round2Passed = round2Date && new Date(round2Date) < new Date();

  function buildUrl(params: { page?: number; dept?: string }) {
    const p = new URLSearchParams();
    if (params.page && params.page > 1) p.set("page", String(params.page));
    if (params.dept) p.set("dept", params.dept);
    const qs = p.toString();
    return `/elections/municipales-2026/resultats${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="container mx-auto px-4 max-w-6xl">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Municipales 2026", href: "/elections/municipales-2026" },
          { label: "Résultats" },
        ]}
      />

      {/* Header */}
      <section className="py-4">
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">Résultats</h1>
        <p className="text-muted-foreground">
          {total.toLocaleString("fr-FR")} commune{total > 1 ? "s" : ""} dépouillées
          {dept && DEPARTMENTS[dept] ? ` en ${DEPARTMENTS[dept].name}` : ""}
        </p>
      </section>

      {/* Stats bar */}
      {stats && (
        <section className="mb-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {stats.eluesT1.toLocaleString("fr-FR")} élue{stats.eluesT1 > 1 ? "s" : ""} au T1
            </Badge>
            {round2Passed ? (
              <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {stats.auSecondTour.toLocaleString("fr-FR")} élue
                {stats.auSecondTour > 1 ? "s" : ""} au T2
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                <Clock className="h-3.5 w-3.5 text-sky-600" />
                {stats.auSecondTour.toLocaleString("fr-FR")} au 2nd tour
              </Badge>
            )}
            <span className="text-muted-foreground">
              Participation moy. : {stats.participationMoyenne.toFixed(1)} %
            </span>
            {daysLeft != null && daysLeft > 0 && (
              <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200 ml-auto">
                2nd tour dans {daysLeft} jour{daysLeft > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </section>
      )}

      {/* Commune search */}
      <section className="mb-6">
        <CommuneSearch
          placeholder="Rechercher une commune..."
          label="Trouver les résultats de ma commune"
          className="max-w-lg"
        />
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2 mb-6">
        {/* Department filter */}
        {dept && (
          <>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary">{DEPARTMENTS[dept]?.name ?? dept}</Badge>
              <Link
                href={buildUrl({})}
                prefetch={false}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                &times; Retirer
              </Link>
            </div>
          </>
        )}
      </section>

      {/* Results grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
        {communes.map((commune) => (
          <div key={commune.id}>
            <Link href={`/elections/municipales-2026/communes/${commune.id}`} prefetch={false}>
              <Card className="h-full hover:bg-muted/50 transition-colors">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold">{commune.name}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {DEPARTMENTS[commune.departmentCode]?.name ?? commune.departmentCode}
                        </span>
                        {commune.population != null && (
                          <span className="text-xs text-muted-foreground">
                            {commune.population.toLocaleString("fr-FR")} hab.
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">
                        {commune.participationRate.toFixed(1)} %
                      </p>
                      <p className="text-xs text-muted-foreground">participation</p>
                    </div>
                  </div>

                  {commune.topListName && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight line-clamp-2">
                            {commune.topListName}
                          </p>
                          {commune.topLeaderName && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {commune.topLeaderName}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold tabular-nums">
                            {commune.topPct != null ? `${commune.topPct.toFixed(1)} %` : "-"}
                          </p>
                        </div>
                      </div>
                      {commune.hasElected ? (
                        <Badge className="mt-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">
                          {commune.hasT2 ? "Élue au 2nd tour" : "Élue au 1er tour"}
                        </Badge>
                      ) : commune.hasT2 ? (
                        <Badge variant="outline" className="mt-2 text-xs text-muted-foreground">
                          Résultat T2 - {commune.listCount} listes
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="mt-2 text-xs text-sky-700 dark:text-sky-400"
                        >
                          2nd tour - {commune.listCount} listes
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          </div>
        ))}
      </section>

      {communes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Aucun résultat trouvé pour ces critères.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-8 mb-12 flex justify-center items-center gap-2" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={buildUrl({
                page: page - 1,
                dept,
              })}
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
              href={buildUrl({
                page: page + 1,
                dept,
              })}
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
