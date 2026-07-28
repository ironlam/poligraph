import { Metadata } from "next";
import { ScrutinsListing } from "@/components/parlement";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { hasActiveListingFilter, listingRobotsMetadata } from "@/lib/seo/listing-robots";
import { VOTES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { normalizeSort } from "@/lib/data/scrutins";

export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{
    page?: string;
    result?: string;
    legislature?: string;
    chamber?: string;
    theme?: string;
    type?: string;
    search?: string;
    filter?: string;
    sort?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  // `sort` is intentionally absent from this whitelist: a sorted view's
  // canonical always points at the unsorted listing (Task 6).
  const canonicalParams = new URLSearchParams();
  if (params.type) canonicalParams.set("type", params.type);
  if (params.theme) canonicalParams.set("theme", params.theme);
  if (params.legislature) canonicalParams.set("legislature", params.legislature);
  if (params.chamber) canonicalParams.set("chamber", params.chamber);
  if (params.result) canonicalParams.set("result", params.result);
  const qs = canonicalParams.toString();

  // Lot 3a: de-index utility-filtered/paginated variants (noindex,follow); the
  // bare /parlement/votes stays indexable. GSC: these facet URLs get 0 clicks.
  // Task 9: the bare ?filter=expliques view is its own indexable surface (own
  // title/canonical); any other param alongside it still falls back to noindex.
  // Task 6: "recent" is normalizeSort()'s default (see @/lib/data/scrutins);
  // the filter bar already omits it from the URL, but an explicit ?sort=recent
  // must still read as the bare listing, not as an active filter, so it is
  // stripped before the presence check below (VOTES_LISTING_FILTER_KEYS
  // otherwise flips noindex on any non-empty `sort`).
  const filterCheckParams = params.sort === "recent" ? { ...params, sort: undefined } : params;

  const isBareExplainedView =
    params.filter === "expliques" &&
    !hasActiveListingFilter(filterCheckParams, VOTES_LISTING_FILTER_KEYS);

  const noindex =
    !isBareExplainedView && hasActiveListingFilter(filterCheckParams, VOTES_LISTING_FILTER_KEYS);

  const chamberTitle =
    params.chamber === "AN"
      ? "Votes de l'Assemblée nationale"
      : params.chamber === "SENAT"
        ? "Votes du Sénat"
        : "Votes parlementaires";
  return {
    title: isBareExplainedView ? "Votes expliqués" : chamberTitle,
    description: isBareExplainedView
      ? "Les votes de l'Assemblée nationale et du Sénat traduits en titres clairs et vérifiés."
      : "Suivez les votes de l'Assemblée nationale et du Sénat. Consultez les scrutins et découvrez comment votent vos représentants.",
    ...listingRobotsMetadata(noindex),
    alternates: {
      canonical: isBareExplainedView
        ? "/parlement/votes?filter=expliques"
        : `/parlement/votes${qs ? `?${qs}` : ""}`,
    },
  };
}

export default async function VotesListingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sort = normalizeSort(params.sort);

  return (
    <>
      <Breadcrumb items={[{ label: "Parlement", href: "/parlement" }, { label: "Votes" }]} />
      <ScrutinsListing searchParams={params} sort={sort} />
    </>
  );
}
