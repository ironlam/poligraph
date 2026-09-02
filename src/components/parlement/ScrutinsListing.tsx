import Link from "next/link";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { VoteCard } from "@/components/votes";
import { VotesFilterBar } from "@/components/votes/VotesFilterBar";
import { ExplainedVotesModule } from "./ExplainedVotesModule";

import {
  getScrutins,
  getLegislatures,
  getChambers,
  getThemeCounts,
  getTypeCounts,
  type ScrutinSort,
} from "@/lib/data/scrutins";
import { getScrutinGroupPositionsBatch } from "@/lib/data/groupes";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { themeToSlug } from "@/lib/theme-utils";
import { themeSeoPhrase } from "@/lib/seo/theme-metadata";
import { SITE_URL } from "@/config/site";
import { statsHref } from "@/config/routes";
import type { VotingResult, Chamber, ThemeCategory, ScrutinType } from "@/types";
import { parsePageParam, parseIntFilter } from "@/lib/data/query-params";

// Map URL param values to data layer params
const TYPE_TAB_MAP: Record<string, { type?: ScrutinType; excludeType?: ScrutinType }> = {
  votes: { excludeType: "AMENDEMENT" },
  amendements: { type: "AMENDEMENT" },
};

interface ScrutinsListingProps {
  searchParams: {
    page?: string;
    result?: string;
    legislature?: string;
    chamber?: string;
    theme?: string;
    type?: string;
    search?: string;
    filter?: string;
  };
  sort: ScrutinSort;
}

export async function ScrutinsListing({ searchParams: params, sort }: ScrutinsListingProps) {
  const page = parsePageParam(params.page);
  const limit = 20;
  const result = (params.result || undefined) as VotingResult | undefined;
  const legislature = parseIntFilter(params.legislature);
  const chamber = (params.chamber || undefined) as Chamber | undefined;
  const theme = (params.theme || undefined) as ThemeCategory | undefined;
  const search = params.search || undefined;
  const typeTab = params.type || "votes"; // default to "votes" (non-amendments)
  const filter = params.filter;
  const explainedOnly = filter === "expliques";

  // Resolve type/excludeType from tab param
  const typeFilter = TYPE_TAB_MAP[typeTab] ?? {};

  const [{ scrutins, total, totalPages, stats }, legislatures, chambers, themeCounts, typeCounts] =
    await Promise.all([
      getScrutins({
        page,
        limit,
        result,
        legislature,
        chamber,
        theme,
        search,
        explainedOnly,
        sort,
        ...typeFilter,
      }),
      getLegislatures(),
      getChambers(),
      getThemeCounts(),
      getTypeCounts(),
    ]);

  // Group positions for the whole page in ONE batched query (anti-N+1), keyed by
  // scrutin id. getScrutins stays untouched; this is the only extra query per page.
  const positionsByScrutin = await getScrutinGroupPositionsBatch(scrutins.map((s) => s.id));

  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const current = new URLSearchParams();
    if (search) current.set("search", search);
    if (result) current.set("result", result);
    if (legislature) current.set("legislature", String(legislature));
    if (chamber) current.set("chamber", chamber);
    if (theme) current.set("theme", theme);
    if (typeTab && typeTab !== "votes") current.set("type", typeTab);
    if (filter) current.set("filter", filter);
    if (sort !== "recent") current.set("sort", sort);

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
    return `/parlement/votes${qs ? `?${qs}` : ""}`;
  };

  // Dynamic title based on chamber (or the explained-votes filter, which takes priority)
  const pageTitle = explainedOnly
    ? "Votes expliqués"
    : chamber
      ? `Votes ${chamber === "AN" ? "de l'Assemblée nationale" : "du Sénat"}`
      : "Votes parlementaires";
  const pageSubtitle = explainedOnly
    ? "Les votes de l'Assemblée nationale et du Sénat traduits en titres clairs."
    : "Scrutins publics en séance - résultats, thèmes et positions des groupes";

  // Adoption rate for results summary
  const adoptedPct = total > 0 && stats.ADOPTED ? Math.round((stats.ADOPTED / total) * 100) : 0;

  // Active filters for display: must match everything the "Effacer les
  // filtres" link below resets (chamber, type, result, legislature, theme, search).
  const hasActiveFilters = !!(
    result ||
    legislature ||
    chamber ||
    theme ||
    search ||
    typeTab !== "votes"
  );

  // Showcase renders only on the default, unfiltered "votes" view (not paginated,
  // not the explained-only listing, default sort) so it doesn't duplicate results
  // the user already filtered for.
  // Internal links to the thematic landings: bare listing only, so the crawlable
  // link block sits on the indexable variant and does not repeat on every facet.
  const showThemeLandings = !explainedOnly && !hasActiveFilters && page === 1;

  const showShowcase =
    !explainedOnly &&
    !search &&
    !result &&
    !legislature &&
    !chamber &&
    !theme &&
    page === 1 &&
    typeTab === "votes" &&
    sort === "recent";

  return (
    <>
      <CollectionPageJsonLd
        name="Votes parlementaires"
        description="Scrutins de l'Assemblée nationale et du Sénat. Résultats, résumés et détails des votes parlementaires."
        url={`${SITE_URL}/parlement/votes`}
        numberOfItems={total}
      />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
              {pageTitle}
            </h1>
            <p className="text-muted-foreground text-sm">{pageSubtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={statsHref("legislatif")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Statistiques
            </Link>
          </div>
        </div>

        {/* Unified filter bar: chamber, portée, thème, résultat, législature, tri, recherche */}
        <VotesFilterBar
          current={{
            chamber,
            result,
            legislature,
            theme,
            type: params.type,
            search,
            sort,
          }}
          options={{
            chambers,
            legislatures,
            themeCounts,
            typeCounts,
          }}
        />

        {/* Thematic landings. The `?theme=` chips in the filter bar above are
            crawl-blocked facets: these descriptive links point at the indexable
            /parlement/votes/themes/[theme] pages instead. Rendered only on the
            bare listing, which is the variant that stays indexable. */}
        {showThemeLandings && (
          <nav aria-label="Votes par thème" className="mb-6">
            <p className="text-sm text-muted-foreground mb-2">Explorer les votes par thème</p>
            <ul className="flex flex-wrap gap-2">
              {themeCounts.map(({ theme: themeCategory, _count }) => (
                <li key={themeCategory}>
                  <Link
                    href={`/parlement/votes/themes/${themeToSlug(themeCategory)}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                  >
                    Votes sur {themeSeoPhrase(themeCategory)}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {_count.toLocaleString("fr-FR")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Results summary */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {total.toLocaleString("fr-FR")} résultats
            </span>
            {adoptedPct > 0 && <span> · {adoptedPct}% adoptés</span>}
          </p>
        </div>

        {showShowcase && <ExplainedVotesModule />}

        {/* List */}
        {scrutins.length > 0 ? (
          <div className="space-y-4">
            {scrutins.map((scrutin) => (
              <VoteCard
                key={scrutin.id}
                id={scrutin.id}
                externalId={scrutin.externalId}
                slug={scrutin.slug}
                title={scrutin.title}
                votingDate={scrutin.votingDate}
                legislature={scrutin.legislature}
                chamber={scrutin.chamber}
                votesFor={scrutin.votesFor}
                votesAgainst={scrutin.votesAgainst}
                votesAbstain={scrutin.votesAbstain}
                result={scrutin.result}
                sourceUrl={scrutin.sourceUrl}
                theme={scrutin.theme}
                type={scrutin.type}
                dossier={scrutin.dossierLegislatif}
                policy={scrutin.policyTitle}
                groupPositions={positionsByScrutin.get(scrutin.id) ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Aucun scrutin trouvé</p>
            {hasActiveFilters && (
              <Link
                href={buildUrl({
                  chamber: undefined,
                  type: undefined,
                  result: undefined,
                  legislature: undefined,
                  theme: undefined,
                  search: undefined,
                })}
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

        {/* Source */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Données issues de{" "}
            <a
              href="https://data.assemblee-nationale.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              data.assemblee-nationale.fr
            </a>{" "}
            et{" "}
            <a
              href="https://www.senat.fr/scrutin-public/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              senat.fr
            </a>{" "}
            (Open Data officiel)
          </p>
        </div>
      </div>
    </>
  );
}
