import { Metadata } from "next";
import Link from "next/link";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FactCheckCard } from "@/components/factchecks/FactCheckCard";
import { FactChecksFilterBar } from "@/components/factchecks/FactChecksFilterBar";
import { SeoIntro } from "@/components/seo/SeoIntro";
import {
  FACTCHECK_RATING_LABELS,
  FACTCHECK_RATING_COLORS,
  FACTCHECK_RATING_DESCRIPTIONS,
} from "@/config/labels";
import {
  getFactchecks,
  getFactcheckStats,
  getFactcheckSources,
  getPoliticianNameBySlug,
  getPoliticianFactcheckContext,
} from "@/lib/data/factchecks";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { listingRobotsMetadata, hasActiveListingFilter } from "@/lib/seo/listing-robots";
import type { FactCheckRating } from "@/types";
import { parsePageParam } from "@/lib/data/query-params";

export const revalidate = 300; // 5 minutes — CDN edge cache with ISR

interface PageProps {
  searchParams: Promise<{
    page?: string;
    source?: string;
    verdict?: string;
    politician?: string;
    search?: string;
    directOnly?: string;
  }>;
}

const FACTCHECK_FILTER_KEYS = ["source", "verdict", "search", "directOnly"] as const;

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;

  if (params.politician) {
    const name = await getPoliticianNameBySlug(params.politician);
    if (name) {
      return {
        title: `Fact-checks de ${name}`,
        description: `Vérifications des déclarations de ${name}. Fact-checks issus de sources reconnues : AFP Factuel, Les Décodeurs et autres.`,
        // The bare ?politician= view stays indexable (nominative intent);
        // extra facets/pagination on top of it are noindex,follow.
        ...listingRobotsMetadata(hasActiveListingFilter(params, FACTCHECK_FILTER_KEYS)),
        alternates: { canonical: `/factchecks?politician=${params.politician}` },
      };
    }
  }

  return {
    title: "Fact-checks",
    description:
      "Vérification des déclarations des responsables politiques français. Fact-checks d'AFP Factuel, Les Décodeurs et autres sources reconnues.",
    // Weak facets and unresolved ?politician= slugs: noindex,follow,
    // canonical consolidates on the bare listing.
    ...listingRobotsMetadata(
      hasActiveListingFilter(params, [...FACTCHECK_FILTER_KEYS, "politician"])
    ),
    alternates: { canonical: "/factchecks" },
  };
}

const RATING_OPTIONS: FactCheckRating[] = [
  "FALSE",
  "MOSTLY_FALSE",
  "MISLEADING",
  "OUT_OF_CONTEXT",
  "HALF_TRUE",
  "MOSTLY_TRUE",
  "TRUE",
  "UNVERIFIABLE",
];

/** Super-category labels for active filter badges. */
const VERDICT_GROUP_LABELS: Record<string, string> = {
  faux: "Faux / Plutôt faux",
  trompeur: "Trompeur / Partiel",
  vrai: "Vrai / Plutôt vrai",
};

export default async function FactChecksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const limit = 12;
  const source = params.source;
  const verdict = params.verdict;
  const politicianSlug = params.politician;
  const search = params.search;
  const directOnly = params.directOnly === "1";

  const [{ factChecks, total, totalPages }, stats, sources, politicianContext] = await Promise.all([
    getFactchecks({ page, limit, source, verdict, politicianSlug, search, directOnly }),
    getFactcheckStats(),
    getFactcheckSources(),
    politicianSlug ? getPoliticianFactcheckContext(politicianSlug) : Promise.resolve(null),
  ]);

  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const current = new URLSearchParams();
    if (params.search) current.set("search", params.search);
    if (params.source) current.set("source", params.source);
    if (params.verdict) current.set("verdict", params.verdict);
    if (params.politician) current.set("politician", params.politician);
    if (params.directOnly) current.set("directOnly", params.directOnly);

    for (const [key, value] of Object.entries(newParams)) {
      if (value) {
        current.set(key, value);
      } else {
        current.delete(key);
      }
    }

    if (Object.keys(newParams).some((k) => k !== "page")) {
      current.delete("page");
    }

    const qs = current.toString();
    return `/factchecks${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <CollectionPageJsonLd
        name="Fact-checks politiques"
        description="Vérification des déclarations des responsables politiques français. Fact-checks d'AFP Factuel, Les Décodeurs et autres sources reconnues."
        url="https://poligraph.fr/factchecks"
        numberOfItems={stats.totalFactChecks}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Fact-checks" }]} />
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">Fact-checks</h1>
          <p className="text-sm text-muted-foreground">
            {stats.totalFactChecks} vérification{stats.totalFactChecks !== 1 ? "s" : ""} issue
            {stats.totalFactChecks !== 1 ? "s" : ""} de {sources.length} sources reconnues
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Les verdicts proviennent des organismes de fact-checking cités, pas de Poligraph.
          </p>
          <div className="sr-only">
            <SeoIntro
              text={`${stats.totalFactChecks.toLocaleString("fr-FR")} vérifications de déclarations politiques, issues de ${sources.length} médias partenaires reconnus.`}
            />
          </div>
        </div>

        {/* Verdict legend */}
        <details className="mb-6 bg-muted/50 rounded-lg border">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-muted/80 rounded-lg transition-colors">
            Comprendre les verdicts
          </summary>
          <div className="px-4 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RATING_OPTIONS.map((rating) => (
              <div key={rating} className="flex items-start gap-2">
                <Badge className={`shrink-0 text-xs ${FACTCHECK_RATING_COLORS[rating]}`}>
                  {FACTCHECK_RATING_LABELS[rating]}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {FACTCHECK_RATING_DESCRIPTIONS[rating]}
                </p>
              </div>
            ))}
          </div>
        </details>

        {/* Filter bar */}
        <FactChecksFilterBar
          currentFilters={{
            search: search || "",
            source: source || "",
            verdict: verdict || "",
            politician: politicianSlug || "",
            directOnly,
          }}
          sources={sources}
          ratingCounts={stats.byRating}
          politicianContext={politicianContext}
        />

        {/* Active filters */}
        {(source || verdict || politicianSlug || search || directOnly) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {directOnly && (
              <Badge variant="secondary" className="gap-1">
                Propos directs
                <Link
                  href={buildUrl({ directOnly: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </Link>
              </Badge>
            )}
            {search && (
              <Badge variant="secondary" className="gap-1">
                Recherche: {search}
                <Link
                  href={buildUrl({ search: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </Link>
              </Badge>
            )}
            {source && (
              <Badge variant="secondary" className="gap-1">
                {source}
                <Link
                  href={buildUrl({ source: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </Link>
              </Badge>
            )}
            {verdict && (
              <Badge
                variant={VERDICT_GROUP_LABELS[verdict] ? "secondary" : undefined}
                className={`gap-1 ${!VERDICT_GROUP_LABELS[verdict] ? FACTCHECK_RATING_COLORS[verdict as FactCheckRating] : ""}`}
              >
                {VERDICT_GROUP_LABELS[verdict] ||
                  FACTCHECK_RATING_LABELS[verdict as FactCheckRating]}
                <Link
                  href={buildUrl({ verdict: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </Link>
              </Badge>
            )}
            {politicianContext && (
              <Badge variant="secondary" className="gap-1">
                {politicianContext.fullName}
                <Link
                  href={buildUrl({ politician: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </Link>
              </Badge>
            )}
            <Link
              href="/factchecks"
              scroll={false}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Effacer tout
            </Link>
          </div>
        )}

        {/* Top politicians */}
        {stats.topPoliticians.length > 0 && !politicianSlug && (
          <div className="mb-6">
            <p className="text-xs text-muted-foreground mb-2">
              Politiciens les plus fact-checkés :
            </p>
            <div className="flex flex-wrap gap-1">
              {stats.topPoliticians.map((p) => (
                <Link
                  key={p.slug}
                  href={buildUrl({ politician: p.slug, directOnly: "1" })}
                  prefetch={false}
                >
                  <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">
                    {p.fullName} ({Number(p.count)})
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          {total} fact-check{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}
        </p>

        {/* Grid */}
        {factChecks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {factChecks.map((fc) => (
              <FactCheckCard
                key={fc.id}
                slug={fc.slug!}
                title={fc.title}
                claimText={fc.claimText}
                claimant={fc.claimant}
                verdict={fc.verdict}
                verdictRating={fc.verdictRating}
                source={fc.source}
                publishedAt={fc.publishedAt}
                mentions={fc.mentions}
                highlightedSlug={politicianSlug}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Aucun fact-check trouvé</p>
            {(source || verdict || politicianSlug || search || directOnly) && (
              <Link
                href="/factchecks"
                scroll={false}
                className="text-primary hover:underline mt-2 inline-block"
              >
                Effacer les filtres
              </Link>
            )}
          </div>
        )}

        {/* Pagination */}
        <SimplePagination
          page={page}
          totalPages={totalPages}
          buildUrl={(p) => buildUrl({ page: String(p) })}
        />

        {/* Info box */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-2">À propos des données</h3>
            <p className="text-sm text-blue-800">
              Données agrégées via la{" "}
              <a
                href="https://toolbox.google.com/factcheck/explorer"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Google Fact Check Tools API
              </a>{" "}
              (standard ClaimReview). Les verdicts sont émis par les organismes de fact-checking
              cités. Poligraph ne produit pas ses propres vérifications.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
