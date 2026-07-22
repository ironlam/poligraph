import Link from "next/link";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { VoteCard, ScrutinTypeTabs } from "@/components/votes";
import { VotesSearchInput } from "@/components/votes/VotesSearchInput";
import { ThemeGrid } from "@/components/votes/ThemeGrid";
import { ExplainedVotesModule } from "./ExplainedVotesModule";

import {
  VOTING_RESULT_LABELS,
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_ICONS,
  THEME_CATEGORY_COLORS,
} from "@/config/labels";
import {
  getScrutins,
  getLegislatures,
  getChambers,
  getThemeCounts,
  getTypeCounts,
} from "@/lib/data/scrutins";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import type { VotingResult, Chamber, ThemeCategory, ScrutinType } from "@/types";
import { Building2 } from "lucide-react";

// Map URL param values to data layer params
const TYPE_TAB_MAP: Record<string, { type?: ScrutinType; excludeType?: ScrutinType }> = {
  votes: { excludeType: "AMENDEMENT" },
  amendements: { type: "AMENDEMENT" },
};

const CHAMBER_META: Record<
  Chamber,
  { label: string; description: string; color: string; activeColor: string; hoverColor: string }
> = {
  AN: {
    label: "Assemblée nationale",
    description: "577 députés",
    color: "border-blue-600",
    activeColor: "bg-blue-600 text-white border-blue-600",
    hoverColor: "hover:bg-blue-50 dark:hover:bg-blue-950/30",
  },
  SENAT: {
    label: "Sénat",
    description: "348 sénateurs",
    color: "border-rose-600",
    activeColor: "bg-rose-600 text-white border-rose-600",
    hoverColor: "hover:bg-rose-50 dark:hover:bg-rose-950/30",
  },
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
}

export async function ScrutinsListing({ searchParams: params }: ScrutinsListingProps) {
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const limit = 20;
  const result = (params.result || undefined) as VotingResult | undefined;
  const legislature = params.legislature ? parseInt(params.legislature, 10) : undefined;
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
        ...typeFilter,
      }),
      getLegislatures(),
      getChambers(),
      getThemeCounts(),
      getTypeCounts(),
    ]);

  // Compute tab counts from type distribution
  const typeCountMap = new Map(typeCounts.map((c) => [c.type, c._count]));
  const totalAll = typeCounts.reduce((sum, c) => sum + c._count, 0);
  const amendementCount = typeCountMap.get("AMENDEMENT") ?? 0;
  const votesCount = totalAll - amendementCount;

  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const current = new URLSearchParams();
    if (search) current.set("search", search);
    if (result) current.set("result", result);
    if (legislature) current.set("legislature", String(legislature));
    if (chamber) current.set("chamber", chamber);
    if (theme) current.set("theme", theme);
    if (typeTab && typeTab !== "votes") current.set("type", typeTab);
    if (filter) current.set("filter", filter);

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

  const hasMultipleChambers = chambers.length > 1;

  // Prepare theme grid data
  const themeGridItems = themeCounts.map((t) => ({
    theme: t.theme,
    label: THEME_CATEGORY_LABELS[t.theme],
    icon: THEME_CATEGORY_ICONS[t.theme],
    colorClass: THEME_CATEGORY_COLORS[t.theme],
    count: t._count,
    isActive: theme === t.theme,
    href: buildUrl({ theme: theme === t.theme ? undefined : t.theme }),
  }));

  // Type tabs
  const tabs = [
    {
      key: "votes",
      label: "Textes de loi",
      count: votesCount,
      href: buildUrl({ type: undefined, page: undefined }),
    },
    {
      key: "amendements",
      label: "Amendements",
      count: amendementCount,
      href: buildUrl({ type: "amendements", page: undefined }),
    },
    {
      key: "tous",
      label: "Tous",
      count: totalAll,
      href: buildUrl({ type: "tous", page: undefined }),
    },
  ];

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

  // Active non-chamber/non-type filters for display
  const hasActiveFilters = !!(result || legislature || theme || search);

  // Showcase renders only on the default, unfiltered "votes" view (not paginated,
  // not the explained-only listing) so it doesn't duplicate results the user
  // already filtered for.
  const showShowcase =
    !explainedOnly &&
    !search &&
    !result &&
    !legislature &&
    !chamber &&
    !theme &&
    page === 1 &&
    typeTab === "votes";

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
              href="/statistiques?tab=votes"
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

        {/* Chamber switcher - prominent, top-level navigation */}
        {hasMultipleChambers && (
          <div className="flex gap-2 mb-6">
            <Link
              href={buildUrl({ chamber: undefined })}
              className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border-2 transition-colors min-h-[48px] ${
                !chamber
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              Tout le Parlement
            </Link>
            {(["AN", "SENAT"] as Chamber[]).map((c) => {
              const meta = CHAMBER_META[c];
              const isActive = chamber === c;
              return (
                <Link
                  key={c}
                  href={buildUrl({ chamber: isActive ? undefined : c })}
                  className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold border-2 transition-colors min-h-[48px] flex-1 ${
                    isActive ? meta.activeColor : `border-border bg-background ${meta.hoverColor}`
                  }`}
                >
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="sm:hidden">{c === "AN" ? "AN" : "Sénat"}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Type tabs */}
        <ScrutinTypeTabs tabs={tabs} activeKey={typeTab} />

        {/* Filters: search + result + legislature in one row */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Search */}
          <VotesSearchInput value={search || ""} />

          {/* Result filter */}
          <div className="flex gap-2">
            <Link
              href={buildUrl({ result: undefined })}
              className={`px-4 py-2 rounded-lg text-sm min-h-[40px] flex items-center transition-colors ${
                !result ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              Tous
            </Link>
            {(["ADOPTED", "REJECTED"] as VotingResult[]).map((r) => (
              <Link
                key={r}
                href={buildUrl({ result: r })}
                className={`px-4 py-2 rounded-lg text-sm min-h-[40px] flex items-center transition-colors ${
                  result === r ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                }`}
              >
                {VOTING_RESULT_LABELS[r]}
              </Link>
            ))}
          </div>

          {/* Legislature filter - no counts */}
          {legislatures.length > 1 && (
            <div className="flex gap-2">
              {legislatures.map((leg) => (
                <Link
                  key={leg.legislature}
                  href={buildUrl({
                    legislature:
                      legislature === leg.legislature ? undefined : String(leg.legislature),
                  })}
                  className={`px-4 py-2 rounded-lg text-sm min-h-[40px] flex items-center transition-colors ${
                    legislature === leg.legislature
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {leg.legislature}e
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Theme filter grid */}
        {themeCounts.length > 0 && (
          <ThemeGrid
            themes={themeGridItems}
            clearHref={buildUrl({ theme: undefined })}
            hasActiveTheme={!!theme}
          />
        )}

        {/* Results summary + clear filters */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {total.toLocaleString("fr-FR")} résultats
            </span>
            {adoptedPct > 0 && <span> · {adoptedPct}% adoptés</span>}
          </p>
          {hasActiveFilters && (
            <Link
              href={buildUrl({
                result: undefined,
                legislature: undefined,
                theme: undefined,
                search: undefined,
              })}
              scroll={false}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Effacer les filtres
            </Link>
          )}
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
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>Aucun scrutin trouvé</p>
            {hasActiveFilters && (
              <Link
                href={buildUrl({
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
