import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { Card, CardContent } from "@/components/ui/card";

import { AffairesFilterBar } from "@/components/affairs/AffairesFilterBar";
import { AffairHubTiles } from "@/components/affairs/AffairHubTiles";
import { AffairListingCard } from "@/components/affairs/AffairListingCard";
import { SeoIntro } from "@/components/seo/SeoIntro";
import {
  getAffairs,
  getSuperCategoryCounts,
  getCertaintyCounts,
  getPartiesWithAffairs,
  getPublicPartyMetadataBySlug,
} from "@/lib/data/affairs";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_SUPER_CATEGORY_LABELS,
  AFFAIR_SUPER_CATEGORY_DESCRIPTIONS,
  type AffairSuperCategory,
} from "@/config/labels";
import { CERTAINTY_LABELS, type CertaintyLevel } from "@/config/certainty";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import type { AffairStatus, Involvement } from "@/types";
import { hasActiveListingFilter, listingRobotsMetadata } from "@/lib/seo/listing-robots";
import { AFFAIRES_DEFAULT_TITLE, AFFAIRES_DEFAULT_DESCRIPTION } from "@/lib/seo/affaires-metadata";
import { AFFAIRES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { buildRetourParam } from "@/lib/affairs/listing-return";
import { parsePageParam } from "@/lib/data/query-params";

export const revalidate = 300; // 5 minutes — CDN edge cache with ISR

interface PageProps {
  searchParams: Promise<{
    search?: string;
    sort?: string;
    status?: string;
    supercat?: string;
    category?: string;
    certainty?: string;
    page?: string;
    parti?: string;
    mode?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const partiSlug = params.parti || "";
  const statusKey = params.status || "";
  const superCatKey = (params.supercat || "") as AffairSuperCategory | "";
  const certaintyKey = (params.certainty || "") as CertaintyLevel | "";

  let title = AFFAIRES_DEFAULT_TITLE;
  let description = AFFAIRES_DEFAULT_DESCRIPTION;
  const party = partiSlug ? await getPublicPartyMetadataBySlug(partiSlug) : null;

  if (party) {
    title = `Affaires judiciaires — ${party.name} (${party.shortName})`;
    description = `Affaires judiciaires impliquant des élus ${party.name}. Filtrez par statut et catégorie. Sources vérifiées.`;
  } else if (certaintyKey && CERTAINTY_LABELS[certaintyKey]) {
    title = `Affaires judiciaires : ${CERTAINTY_LABELS[certaintyKey]}`;
    description = `Responsables politiques français avec une affaire au niveau "${CERTAINTY_LABELS[certaintyKey]}".`;
  } else if (statusKey && AFFAIR_STATUS_LABELS[statusKey as AffairStatus]) {
    title = `Affaires judiciaires : ${AFFAIR_STATUS_LABELS[statusKey as AffairStatus]}`;
    description = `Responsables politiques français avec une affaire au statut "${AFFAIR_STATUS_LABELS[statusKey as AffairStatus]}".`;
  } else if (superCatKey && AFFAIR_SUPER_CATEGORY_LABELS[superCatKey]) {
    title = `Affaires judiciaires : ${AFFAIR_SUPER_CATEGORY_LABELS[superCatKey]}`;
    description = `${AFFAIR_SUPER_CATEGORY_DESCRIPTIONS[superCatKey]}. Liste des responsables politiques concernés.`;
  }

  // Lot 3b: de-index utility-filtered/paginated/perimeter variants (noindex,follow);
  // bare /affaires (default "mise-en-cause" perimeter) stays indexable. GSC: these
  // /affaires facet URLs get ~0 clicks (the condamnations hub captures the intent).
  const hasNonDefaultMode = params.mode !== undefined && params.mode !== "mise-en-cause";

  const noindex = hasActiveListingFilter(params, AFFAIRES_LISTING_FILTER_KEYS) || hasNonDefaultMode;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Poligraph`,
      description,
    },
    ...listingRobotsMetadata(noindex),
    alternates: {
      canonical: (() => {
        const cp = new URLSearchParams();
        if (party) cp.set("parti", partiSlug);
        if (certaintyKey) cp.set("certainty", certaintyKey);
        if (statusKey) cp.set("status", statusKey);
        if (superCatKey) cp.set("supercat", superCatKey);
        if (params.category) cp.set("category", params.category);
        if (params.mode && params.mode !== "mise-en-cause") cp.set("mode", params.mode);
        const qs = cp.toString();
        return `/affaires${qs ? `?${qs}` : ""}`;
      })(),
    },
  };
}

export default async function AffairesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const searchFilter = params.search || "";
  const sortFilter = params.sort || "";
  const statusFilter = params.status || "";
  const superCatFilter = (params.supercat || "") as AffairSuperCategory | "";
  const categoryFilter = params.category || "";
  const certaintyFilter = (params.certainty || "") as CertaintyLevel | "";
  const partiFilter = params.parti || "";
  const page = parsePageParam(params.page);
  const mode = (params.mode === "victime" ? "victime" : "mise-en-cause") as
    | "mise-en-cause"
    | "victime";

  // An unknown ?parti= slug is a 404, not an empty listing: a real party with
  // zero affairs and a slug that does not exist must not render alike. Checked
  // before the listing queries, so an arbitrary slug costs one indexed lookup
  // instead of a full page render.
  // The name is kept, not just the existence: the empty state names the party
  // rather than claiming the whole base holds nothing.
  const partyMeta = partiFilter ? await getPublicPartyMetadataBySlug(partiFilter) : null;
  if (partiFilter && !partyMeta) {
    notFound();
  }

  const activeInvolvements =
    mode === "victime"
      ? (["VICTIM", "PLAINTIFF"] as Involvement[])
      : (["DIRECT", "INDIRECT", "MENTIONED_ONLY"] as Involvement[]);

  const [{ affairs, total, totalPages }, superCounts, certaintyCounts, partiesWithAffairs] =
    await Promise.all([
      getAffairs(
        searchFilter || undefined,
        statusFilter,
        superCatFilter || undefined,
        categoryFilter,
        undefined, // severity — removed from public filters
        page,
        activeInvolvements,
        partiFilter || undefined,
        sortFilter || undefined,
        certaintyFilter || undefined
      ),
      getSuperCategoryCounts(),
      getCertaintyCounts(),
      getPartiesWithAffairs(),
    ]);

  const totalAffairs = Object.values(superCounts).reduce((a, b) => a + b, 0);

  // Serialise the active perimeter so each card's detail link can offer a
  // non-destructive "Retour aux N résultats" (read client-side on the detail
  // page; the detail canonical stays clean, so no `?retour=` is ever indexed).
  const retourParam = buildRetourParam({
    search: searchFilter,
    sort: sortFilter,
    status: statusFilter,
    supercat: superCatFilter,
    category: categoryFilter,
    certainty: certaintyFilter,
    parti: partiFilter,
    mode: mode !== "mise-en-cause" ? mode : "",
  });

  // Build URL helper (only used for super-category cards + pagination)
  function buildUrl(params: Record<string, string>) {
    const url = new URL("/affaires", "http://localhost");
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    if (mode !== "mise-en-cause") url.searchParams.set("mode", mode);
    const search = url.searchParams.toString();
    return search ? `/affaires?${search}` : "/affaires";
  }

  return (
    <>
      <CollectionPageJsonLd
        name="Affaires judiciaires des responsables politiques"
        description="Affaires judiciaires impliquant des responsables politiques français, documentées avec sources vérifiables."
        url={`${SITE_URL}/affaires`}
        numberOfItems={totalAffairs}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Affaires" }]} />
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
              Affaires judiciaires
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalAffairs} affaire{totalAffairs !== 1 ? "s" : ""} documentée
              {totalAffairs !== 1 ? "s" : ""} avec sources vérifiables
            </p>
            <div className="sr-only">
              <SeoIntro
                text={`${totalAffairs} affaires judiciaires impliquant des responsables politiques, documentées avec sources vérifiables. Mises en examen, procès, condamnations et relaxes.`}
              />
            </div>
          </div>
        </div>

        {/* Hub tiles: route the strong judicial/statistics/victim intents from the bare listing */}
        <div className="mb-4">
          <AffairHubTiles etabliCount={certaintyCounts.ETABLI ?? 0} />
        </div>

        {/* Victim mode methodology note */}
        {mode === "victime" && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Affaires pour lesquelles un élu est victime ou plaignant, documentées par au moins une
              source journalistique vérifiable.{" "}
              <a href="/sources" className="underline hover:no-underline">
                En savoir plus
              </a>
            </p>
          </div>
        )}

        {/* Banner when filtered by party */}
        {partiFilter &&
          (() => {
            const matchedParty = partiesWithAffairs.find((p) => p.slug === partiFilter);
            return matchedParty ? (
              <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  Affaires filtrées par {matchedParty.name}
                </p>
                <Link
                  href={`/affaires/parti/${partiFilter}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Voir la page complète {matchedParty.shortName} →
                </Link>
              </div>
            ) : null;
          })()}

        {/* Compact filter bar */}
        <AffairesFilterBar
          mode={mode}
          currentFilters={{
            search: searchFilter,
            sort: sortFilter,
            certainty: certaintyFilter,
            parti: partiFilter,
            category: categoryFilter,
            supercat: superCatFilter,
          }}
          parties={partiesWithAffairs.map((p) => ({
            slug: p.slug as string,
            shortName: p.shortName,
            name: p.name,
            count: p._count.affairsAtTime,
          }))}
          certaintyCounts={certaintyCounts}
          superCounts={superCounts}
        />

        {/* Condamnations hub callout when ETABLI certainty is active */}
        {certaintyFilter === "ETABLI" && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm">
              Une page dédiée aux condamnations est désormais disponible, avec vue par mandat et
              taux par parti.
            </p>
            <Link
              href="/affaires/condamnations?certainty=etabli"
              className="text-sm font-medium text-primary hover:underline"
              prefetch={false}
            >
              Voir le hub Condamnations →
            </Link>
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          {total} résultat{total !== 1 ? "s" : ""}
        </p>

        {/* Results */}
        {affairs.length > 0 ? (
          <>
            <div className="space-y-4">
              {affairs.map((affair) => (
                <AffairListingCard
                  key={affair.id}
                  affair={affair}
                  retour={retourParam}
                  resultCount={total}
                />
              ))}
            </div>

            {/* Pagination */}
            <SimplePagination
              page={page}
              totalPages={totalPages}
              buildUrl={(p) =>
                buildUrl({
                  search: searchFilter,
                  page: String(p),
                  sort: sortFilter,
                  certainty: certaintyFilter,
                  supercat: superCatFilter,
                  category: categoryFilter,
                  parti: partiFilter,
                })
              }
            />
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-2">
                Aucune affaire documentée
                {partyMeta
                  ? ` pour ${partyMeta.name}`
                  : searchFilter ||
                      certaintyFilter ||
                      superCatFilter ||
                      statusFilter ||
                      categoryFilter
                    ? " avec ces filtres"
                    : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Les affaires sont ajoutées avec des sources vérifiables. Notre base est enrichie
                régulièrement et ne prétend pas à l&apos;exhaustivité.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info box */}
        <Card className="mt-8 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="pt-6">
            <h3 className="mb-2 font-semibold text-blue-900 dark:text-blue-200">
              À propos des données
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Les affaires listées sont issues de sources publiques vérifiables (articles de presse,
              décisions de justice) et font l&apos;objet d&apos;une validation éditoriale avant
              publication. Les procédures en cours sont présentées avec rappel de la présomption
              d&apos;innocence. Les issues favorables (relaxe, acquittement, non-lieu, classement
              sans suite) sont distinguées des condamnations ; l&apos;action publique éteinte par
              prescription est signalée comme telle.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
