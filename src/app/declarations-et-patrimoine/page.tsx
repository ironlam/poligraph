import { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { SeoIntro } from "@/components/seo/SeoIntro";
import { CollectionPageJsonLd, FAQJsonLd, ItemListJsonLd } from "@/components/seo/JsonLd";
import { formatCompactCurrency } from "@/lib/utils";
import { ensureContrast } from "@/lib/contrast";
import {
  DeclarationsFilterBar,
  type DeclarationSortOption,
} from "@/components/declarations/DeclarationsFilterBar";
import { FAQ_ITEMS } from "@/config/declarations";
import {
  getDeclarationStats,
  getTopPortfolios,
  getTopCompanies,
  getDeclarations,
  getParties,
  getPartyTransparency,
  type DeclarationRow,
} from "@/lib/data/declarations";
import { SITE_URL } from "@/config/site";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { listingRobotsMetadata, hasActiveListingFilter } from "@/lib/seo/listing-robots";
import { parsePageParam } from "@/lib/data/query-params";

export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    party?: string;
    sort?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "Patrimoine et déclarations d'intérêts des élus — HATVP",
    description:
      "Explorez le patrimoine et les déclarations d'intérêts des députés, sénateurs et ministres français. Portefeuilles financiers, participations, revenus et activités — données officielles HATVP.",
    // Filtered/paginated variants: noindex,follow, canonical consolidates on the bare listing.
    ...listingRobotsMetadata(hasActiveListingFilter(params, ["search", "party", "sort"])),
    openGraph: {
      title: "Patrimoine et déclarations d'intérêts des élus — Poligraph",
      description:
        "Classement des élus par patrimoine déclaré, entreprises détenues et revenus. Source officielle : HATVP.",
    },
    alternates: { canonical: "/declarations-et-patrimoine" },
  };
}

// ─── Page component ───────────────────────────────────────────

export default async function DeclarationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search || "";
  const partyFilter = params.party || "";
  const sortOption = (params.sort || "portfolio") as DeclarationSortOption;
  const page = parsePageParam(params.page);

  const [stats, topPortfolios, topCompanies, tableData, parties, transparency] = await Promise.all([
    getDeclarationStats(),
    getTopPortfolios(10),
    getTopCompanies(10),
    getDeclarations(search, partyFilter, sortOption, page),
    getParties(),
    getPartyTransparency(),
  ]);

  const maxPortfolio = topPortfolios[0]?.totalPortfolioValue ?? 1;

  return (
    <>
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Déclarations et patrimoine" }]} />
        <CollectionPageJsonLd
          name="Déclarations HATVP des élus français"
          description="Déclarations d'intérêts et de patrimoine des députés, sénateurs et ministres français. Données officielles de la HATVP."
          url={`${SITE_URL}/declarations-et-patrimoine`}
          numberOfItems={stats.totalDeclarations}
          about={{ name: "HATVP", url: "https://www.hatvp.fr" }}
        />
        <ItemListJsonLd
          name="Classement des élus par portefeuille déclaré"
          description="Les élus français avec les plus gros portefeuilles financiers déclarés auprès de la HATVP."
          url={`${SITE_URL}/declarations-et-patrimoine`}
          items={topPortfolios.map((p, i) => ({
            name: p.fullName,
            url: `${SITE_URL}/politiques/${p.slug}`,
            position: i + 1,
          }))}
        />
        <FAQJsonLd questions={FAQ_ITEMS} />

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
            Patrimoine et déclarations des élus
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Explorez le patrimoine, les intérêts et les activités déclarés par les élus français
            auprès de la Haute Autorité pour la Transparence de la Vie Publique (HATVP).
          </p>
          <div className="sr-only">
            <SeoIntro
              text={`Poligraph référence ${stats.totalDeclarations.toLocaleString("fr-FR")} déclarations HATVP pour ${stats.politiciansWithDeclarations.toLocaleString("fr-FR")} élus français. Consultez les portefeuilles financiers, participations dans des entreprises, revenus déclarés et postes de direction.`}
            />
          </div>
        </div>

        {/* Rankings: top portfolios + top companies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* Top portfolios */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Les plus gros portefeuilles déclarés</h2>
              <p className="text-xs text-muted-foreground">
                Classement par valeur totale des participations financières
              </p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3" aria-label="Classement des portefeuilles">
                {topPortfolios.map((p, i) => (
                  <li key={p.id}>
                    <Link
                      href={`/politiques/${p.slug}`}
                      className="flex items-center gap-3 group hover:bg-accent/50 rounded-lg p-2 -m-2 transition-colors"
                    >
                      <span
                        className="text-xs font-bold w-5 text-center flex-shrink-0"
                        style={{ color: i < 3 ? "#d97706" : undefined }}
                      >
                        {i + 1}
                      </span>
                      <PoliticianAvatar
                        photoUrl={p.photoUrl}
                        firstName={p.firstName}
                        lastName={p.lastName}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium group-hover:text-primary transition-colors">
                            {p.fullName}
                          </span>
                          {p.party && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 flex-shrink-0"
                              style={{
                                backgroundColor: p.party.color ? `${p.party.color}15` : undefined,
                                color: p.party.color
                                  ? ensureContrast(p.party.color, "#ffffff")
                                  : undefined,
                              }}
                            >
                              {p.party.shortName}
                            </Badge>
                          )}
                        </div>
                        {/* Mini bar */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(p.totalPortfolioValue / maxPortfolio) * 100}%`,
                                backgroundColor: "#059669",
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {formatCompactCurrency(p.totalPortfolioValue)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Top companies */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Entreprises les plus détenues par les élus</h2>
              <p className="text-xs text-muted-foreground">
                Sociétés apparaissant dans le plus de déclarations
              </p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3" aria-label="Entreprises les plus déclarées">
                {topCompanies.map((c, i) => {
                  const maxCount = topCompanies[0]?.politicianCount ?? 1;
                  return (
                    <li key={c.company} className="flex items-center gap-3">
                      <span
                        className="text-xs font-bold w-5 text-center flex-shrink-0"
                        style={{ color: i < 3 ? "#2563eb" : undefined }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{c.company}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                            {c.politicianCount} élu{c.politicianCount > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(c.politicianCount / maxCount) * 100}%`,
                              backgroundColor: "#2563eb",
                            }}
                          />
                        </div>
                        {c.totalValue > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Valeur cumulée : {formatCompactCurrency(c.totalValue)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Party transparency */}
        {transparency.length > 0 && (
          <Card className="mb-10">
            <CardHeader>
              <h2 className="text-lg font-semibold">Transparence par parti</h2>
              <p className="text-xs text-muted-foreground">
                Taux de parlementaires (députés et sénateurs) ayant une déclaration d&apos;intérêts
                publiée sur le site de la HATVP
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transparency.map((p) => (
                  <div key={p.partyId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{p.partyShortName || p.partyName}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {p.withDeclaration}/{p.totalParliamentarians} ({p.rate}%)
                      </span>
                    </div>
                    <div className="h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${p.rate}%`,
                          backgroundColor: p.partyColor || "hsl(var(--primary))",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Listing section */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">
            Tous les élus déclarants
            <span className="text-muted-foreground text-base font-normal ml-2">
              ({tableData.total})
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {search ? `Résultats pour "${search}"` : "Élus ayant au moins une déclaration HATVP"}
          </p>

          {/* Filters */}
          <DeclarationsFilterBar
            parties={parties}
            defaultSearch={search}
            partyFilter={partyFilter}
            sortOption={sortOption}
          />
        </div>

        {/* Results grid */}
        {tableData.rows.length === 0 ? (
          <div id="resultats" className="text-center py-12 text-muted-foreground">
            <p className="text-lg">Aucun résultat</p>
            <p className="text-sm mt-1">
              {search
                ? "Essayez un autre terme de recherche."
                : "Aucun élu ne correspond aux filtres sélectionnés."}
            </p>
          </div>
        ) : (
          <div id="resultats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {tableData.rows.map((row) => (
              <DeclarationListCard key={row.id} row={row} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {tableData.totalPages > 1 && (
          <Pagination
            currentPage={tableData.page}
            totalPages={tableData.totalPages}
            search={search}
            partyFilter={partyFilter}
            sortOption={sortOption}
          />
        )}

        {/* FAQ Section */}
        <section className="mt-16 border-t pt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-xl font-semibold mb-6">
            Questions fréquentes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FAQ_ITEMS.map((item) => (
              <Card key={item.question}>
                <CardContent className="pt-5">
                  <h3 className="font-medium mb-2">{item.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-6 text-center">
            Source :{" "}
            <a
              href="https://www.hatvp.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Haute Autorité pour la Transparence de la Vie Publique
            </a>
          </p>
        </section>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function DeclarationListCard({ row }: { row: DeclarationRow }) {
  return (
    <Link href={`/politiques/${row.slug}`} className="block group focus-visible:outline-none">
      <Card className="h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="transition-transform duration-300 group-hover:scale-110">
              <PoliticianAvatar
                photoUrl={row.photoUrl}
                firstName={row.firstName}
                lastName={row.lastName}
                size="sm"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold group-hover:text-primary transition-colors">
                {row.fullName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {row.party && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                    style={{
                      backgroundColor: row.party.color ? `${row.party.color}15` : undefined,
                      color: row.party.color
                        ? ensureContrast(row.party.color, "#ffffff")
                        : undefined,
                    }}
                  >
                    {row.party.shortName || row.party.name}
                  </Badge>
                )}
                {row.latestYear && (
                  <span className="text-[10px] text-muted-foreground">{row.latestYear}</span>
                )}
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          {row.hasDetails ? (
            <div className="grid grid-cols-2 gap-2">
              <MetricCell
                value={formatCompactCurrency(row.totalPortfolioValue)}
                label="Portefeuille"
              />
              <MetricCell value={String(row.totalCompanies)} label="Participations" />
              <MetricCell
                value={formatCompactCurrency(row.latestAnnualIncome)}
                label="Revenus/an"
              />
              <MetricCell value={String(row.totalDirectorships)} label="Directions" />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 text-center">
              {row.declarationCount} déclaration{row.declarationCount > 1 ? "s" : ""} — détails non
              disponibles en open data
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function MetricCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-muted/50 rounded-md px-2 py-1.5">
      <div className="text-sm font-bold font-mono">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  search,
  partyFilter,
  sortOption,
}: {
  currentPage: number;
  totalPages: number;
  search: string;
  partyFilter: string;
  sortOption: string;
}) {
  function buildUrl(page: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (partyFilter) params.set("party", partyFilter);
    if (sortOption && sortOption !== "portfolio") params.set("sort", sortOption);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/declarations-et-patrimoine${qs ? `?${qs}` : ""}`;
  }

  // Show limited page numbers around current
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mb-8">
      {currentPage > 1 && (
        <Link
          href={buildUrl(currentPage - 1)}
          className="px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
          aria-label="Page précédente"
        >
          &larr;
        </Link>
      )}
      {start > 1 && (
        <>
          <Link
            href={buildUrl(1)}
            className="px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
          >
            1
          </Link>
          {start > 2 && <span className="px-2 text-muted-foreground">...</span>}
        </>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={buildUrl(p)}
          className={`px-3 py-2 text-sm rounded-md transition-colors ${
            p === currentPage ? "bg-primary text-primary-foreground font-medium" : "hover:bg-accent"
          }`}
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p}
        </Link>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
          <Link
            href={buildUrl(totalPages)}
            className="px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
          >
            {totalPages}
          </Link>
        </>
      )}
      {currentPage < totalPages && (
        <Link
          href={buildUrl(currentPage + 1)}
          className="px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
          aria-label="Page suivante"
        >
          &rarr;
        </Link>
      )}
    </nav>
  );
}
