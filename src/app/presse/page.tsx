import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { PressCard, PartyFilterSelect } from "@/components/presse";
import { PresseSearchInput } from "@/components/presse/PresseSearchInput";
import { Badge } from "@/components/ui/badge";
import { ensureContrast } from "@/lib/contrast";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getPress, getPressStats, getPartiesWithPressMentions } from "@/lib/data/press";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { listingRobotsMetadata, hasActiveListingFilter } from "@/lib/seo/listing-robots";
import { parsePageParam } from "@/lib/data/query-params";

export const revalidate = 300; // ISR: re-check feature flag every 5 minutes

interface PageProps {
  searchParams: Promise<{
    page?: string;
    source?: string;
    party?: string;
    search?: string;
    sort?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "Revue de presse",
    description:
      "Suivez l'actualité politique française. Articles du Monde, Politico et Mediapart mentionnant les responsables politiques.",
    // Filtered/paginated variants: noindex,follow, canonical consolidates on the bare listing.
    ...listingRobotsMetadata(hasActiveListingFilter(params, ["search", "source", "party", "sort"])),
    alternates: { canonical: "/presse" },
  };
}

const SOURCE_OPTIONS = [
  { id: "lemonde", name: "Le Monde" },
  { id: "politico", name: "Politico" },
  { id: "mediapart", name: "Mediapart" },
];

export default async function PressePage({ searchParams }: PageProps) {
  if (!(await isFeatureEnabled("PRESS_SECTION"))) notFound();

  const params = await searchParams;
  const page = parsePageParam(params.page);
  const limit = 12;
  const source = params.source;
  const partyId = params.party;
  const search = params.search;
  const sort = "recent";

  const [{ articles, total, totalPages }, stats, partiesWithMentions] = await Promise.all([
    getPress({ page, limit, source, partyId, search, sort }),
    getPressStats(),
    getPartiesWithPressMentions(),
  ]);

  // Get current party name for display
  const currentParty = partyId ? partiesWithMentions.find((p) => p.id === partyId) : null;

  // Build filter URL helper
  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const current = new URLSearchParams();
    if (params.search) current.set("search", params.search);
    if (params.source) current.set("source", params.source);
    if (params.party) current.set("party", params.party);
    if (params.sort && params.sort !== "relevance") current.set("sort", params.sort);

    for (const [key, value] of Object.entries(newParams)) {
      if (value) {
        current.set(key, value);
      } else {
        current.delete(key);
      }
    }

    // Reset page when filters change
    if (Object.keys(newParams).some((k) => k !== "page")) {
      current.delete("page");
    }

    const qs = current.toString();
    return `/presse${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Presse" }]} />
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
            Revue de presse
          </h1>
          <p className="text-muted-foreground">
            Les derniers articles politiques du Monde, Politico et Mediapart mentionnant les
            responsables politiques.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-2xl font-bold">{stats.totalArticles}</p>
            <p className="text-sm text-muted-foreground">Articles</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.totalMentions}</p>
            <p className="text-sm text-muted-foreground">Politiciens cités</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.totalPartyMentions}</p>
            <p className="text-sm text-muted-foreground">Partis cités</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{SOURCE_OPTIONS.length}</p>
            <p className="text-sm text-muted-foreground">Sources</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Search */}
          <PresseSearchInput value={search || ""} />

          {/* Source filter */}
          <div className="flex gap-2">
            <Link
              href={buildUrl({ source: undefined })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !source ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              Toutes ({stats.totalArticles})
            </Link>
            {SOURCE_OPTIONS.map((s) => (
              <Link
                key={s.id}
                href={buildUrl({ source: source === s.id ? undefined : s.id })}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  source === s.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {s.name} ({stats.bySource[s.id] || 0})
              </Link>
            ))}
          </div>

          {/* The relevance sort stays disabled until its score can use public mentions only. */}
          <div className="flex gap-2">
            <Link
              href={buildUrl({ sort: undefined })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                sort === "recent"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              Récents
            </Link>
          </div>

          {/* Party filter dropdown */}
          {partiesWithMentions.length > 0 && (
            <PartyFilterSelect
              parties={partiesWithMentions.map((p) => ({
                id: p.id,
                shortName: p.shortName,
                mentionCount: p._count.pressMentions,
              }))}
              currentPartyId={partyId}
              baseUrl={buildUrl({})}
            />
          )}
        </div>

        {/* Active filters */}
        {(source || partyId || search) && (
          <div className="flex flex-wrap gap-2 mb-6">
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
                {SOURCE_OPTIONS.find((s) => s.id === source)?.name || source}
                <Link
                  href={buildUrl({ source: undefined })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </Link>
              </Badge>
            )}
            {currentParty && (
              <Badge
                variant="secondary"
                className="gap-1"
                title={currentParty.name}
                style={{
                  borderColor: currentParty.color || undefined,
                  color: currentParty.color
                    ? ensureContrast(currentParty.color, "#ffffff")
                    : undefined,
                }}
              >
                {currentParty.shortName}
                <Link href={buildUrl({ party: undefined })} className="ml-1 hover:text-destructive">
                  ×
                </Link>
              </Badge>
            )}
            <Link
              href="/presse"
              scroll={false}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Effacer tout
            </Link>
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          {total} article{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}
        </p>

        {/* Articles grid */}
        {articles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {articles.map((article) => (
              <PressCard
                key={article.id}
                id={article.id}
                title={article.title}
                description={article.description}
                url={article.url}
                imageUrl={article.imageUrl}
                feedSource={article.feedSource}
                publishedAt={article.publishedAt}
                mentions={article.mentions}
                partyMentions={article.partyMentions}
                mentionCount={article._count.mentions}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Aucun article trouvé</p>
            {(source || partyId || search) && (
              <Link
                href="/presse"
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

        {/* Sources info */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Données agrégées depuis les flux RSS de{" "}
            <a
              href="https://www.lemonde.fr/politique/rss_full.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Le Monde
            </a>
            ,{" "}
            <a
              href="https://www.politico.eu/section/politics/feed/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Politico.eu
            </a>{" "}
            et{" "}
            <a
              href="https://www.mediapart.fr/articles/feed"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Mediapart
            </a>
            . Mise à jour quotidienne.
          </p>
        </div>
      </div>
    </>
  );
}
