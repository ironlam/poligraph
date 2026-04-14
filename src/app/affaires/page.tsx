import { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { AffairesFilterBar } from "@/components/affairs/AffairesFilterBar";
import { SeoIntro } from "@/components/seo/SeoIntro";
import { stripMarkdown } from "@/lib/utils";
import {
  getAffairs,
  getSuperCategoryCounts,
  getCertaintyCounts,
  getPartiesWithAffairs,
} from "@/lib/data/affairs";
import { getAffairPartyDisplay } from "@/lib/affairs/party-display";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
  AFFAIR_SUPER_CATEGORY_LABELS,
  AFFAIR_SUPER_CATEGORY_COLORS,
  AFFAIR_SUPER_CATEGORY_DESCRIPTIONS,
  CATEGORY_TO_SUPER,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_COLORS,
  type AffairSuperCategory,
} from "@/config/labels";
import {
  getCertaintyLevel,
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  type CertaintyLevel,
} from "@/config/certainty";
import { AffairModeToggle } from "@/components/affairs/AffairModeToggle";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import type { AffairStatus, Involvement } from "@/types";

export const revalidate = 300; // 5 minutes — CDN edge cache with ISR

// Hex border colors for affair card left-border (keyed by super-category)
const SUPER_CATEGORY_BORDER: Record<AffairSuperCategory, string> = {
  PROBITE: "#9333ea",
  FINANCES: "#2563eb",
  PERSONNES: "#dc2626",
  EXPRESSION: "#d97706",
  AUTRE: "#6b7280",
};

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

  let title = "Affaires judiciaires des responsables politiques français";
  let description =
    "Liste des affaires judiciaires impliquant des responsables politiques français. Sources vérifiées, présomption d'innocence respectée.";

  if (partiSlug) {
    const party = await db.party.findUnique({
      where: { slug: partiSlug },
      select: { name: true, shortName: true },
    });
    if (party) {
      title = `Affaires judiciaires — ${party.name} (${party.shortName})`;
      description = `Affaires judiciaires impliquant des élus ${party.name}. Filtrez par statut et catégorie. Sources vérifiées.`;
    }
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

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Poligraph`,
      description,
    },
    alternates: {
      canonical: (() => {
        const cp = new URLSearchParams();
        if (partiSlug) cp.set("parti", partiSlug);
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
  const page = parseInt(params.page || "1", 10);
  const mode = (params.mode === "victime" ? "victime" : "mise-en-cause") as
    | "mise-en-cause"
    | "victime";

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

        {/* Mode toggle */}
        <div className="mb-4">
          <AffairModeToggle mode={mode} />
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

        {/* Party quick-links */}
        {partiesWithAffairs.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Par parti</p>
            <div className="flex flex-wrap gap-2">
              {partiesWithAffairs
                .sort((a, b) => b._count.affairsAtTime - a._count.affairsAtTime)
                .slice(0, 12)
                .map((p) => (
                  <Link
                    key={p.slug}
                    href={`/affaires/parti/${p.slug}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border hover:bg-muted transition-colors"
                    prefetch={false}
                  >
                    <span className="font-medium">{p.shortName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p._count.affairsAtTime}
                    </span>
                  </Link>
                ))}
            </div>
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

        {/* Active filters summary */}
        {(searchFilter || superCatFilter || certaintyFilter || categoryFilter || partiFilter) && (
          <div className="mb-6 flex items-center gap-2 text-sm flex-wrap">
            <span className="text-muted-foreground">Filtres actifs :</span>
            {searchFilter && <Badge variant="outline">Recherche : {searchFilter}</Badge>}
            {partiFilter && (
              <Badge variant="outline">
                Parti :{" "}
                {partiesWithAffairs.find((p) => p.slug === partiFilter)?.shortName || partiFilter}
              </Badge>
            )}
            {superCatFilter && (
              <Badge className={AFFAIR_SUPER_CATEGORY_COLORS[superCatFilter]}>
                {AFFAIR_SUPER_CATEGORY_LABELS[superCatFilter]}
              </Badge>
            )}
            {certaintyFilter && (
              <Badge className={CERTAINTY_COLORS[certaintyFilter as CertaintyLevel]}>
                {CERTAINTY_LABELS[certaintyFilter as CertaintyLevel]}
              </Badge>
            )}
            {categoryFilter && (
              <Badge variant="outline">
                {AFFAIR_CATEGORY_LABELS[categoryFilter as keyof typeof AFFAIR_CATEGORY_LABELS]}
              </Badge>
            )}
            <Link
              href={mode === "victime" ? "/affaires?mode=victime" : "/affaires"}
              scroll={false}
              className="text-primary hover:underline ml-2"
            >
              Effacer les filtres
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
              {affairs.map((affair) => {
                const superCat = CATEGORY_TO_SUPER[affair.category];
                const certainty = getCertaintyLevel(affair.status);
                // Get the most relevant date for display
                const relevantDate = affair.verdictDate || affair.startDate || affair.factsDate;
                const dateLabel = affair.verdictDate
                  ? "Verdict"
                  : affair.startDate
                    ? "Révélation"
                    : affair.factsDate
                      ? "Faits"
                      : null;
                return (
                  <Card
                    key={affair.id}
                    className="border-l-4 transition-shadow hover:shadow-md"
                    style={{ borderLeftColor: SUPER_CATEGORY_BORDER[superCat] }}
                  >
                    <CardContent className="pt-6">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start gap-2 mb-2 flex-wrap">
                            {relevantDate && (
                              <Badge variant="secondary" className="font-mono text-base">
                                {new Date(relevantDate).getFullYear()}
                                {dateLabel && (
                                  <span className="ml-1 text-xs opacity-70">({dateLabel})</span>
                                )}
                              </Badge>
                            )}
                            <Badge className={AFFAIR_SUPER_CATEGORY_COLORS[superCat]}>
                              {AFFAIR_SUPER_CATEGORY_LABELS[superCat]}
                            </Badge>
                            <Badge className={CERTAINTY_COLORS[certainty]}>
                              {CERTAINTY_LABELS[certainty]}
                            </Badge>
                            <Badge variant="outline">
                              {AFFAIR_CATEGORY_LABELS[affair.category]}
                            </Badge>
                            {affair.involvement !== "DIRECT" && (
                              <Badge
                                className={INVOLVEMENT_COLORS[affair.involvement as Involvement]}
                              >
                                {INVOLVEMENT_LABELS[affair.involvement as Involvement]}
                              </Badge>
                            )}
                          </div>

                          <h2 className="text-lg font-semibold mb-1">{affair.title}</h2>

                          <Link
                            href={`/politiques/${affair.politician.slug}`}
                            className="text-primary hover:underline text-sm"
                          >
                            {affair.politician.fullName}
                          </Link>
                          {(() => {
                            const display = getAffairPartyDisplay({
                              factsDate: affair.factsDate,
                              partyAtTime: affair.partyAtTime,
                              currentParty: affair.politician.currentParty,
                            });
                            if (display.kind === "at-time") {
                              return (
                                <span className="text-sm text-muted-foreground">
                                  {" ("}
                                  {display.party.slug ? (
                                    <Link
                                      href={`/affaires/parti/${display.party.slug}`}
                                      className="hover:underline hover:text-foreground"
                                    >
                                      {display.party.shortName}
                                    </Link>
                                  ) : (
                                    display.party.shortName
                                  )}
                                  {!display.sameAsCurrent && (
                                    <span className="text-xs"> à l&apos;époque</span>
                                  )}
                                  {")"}
                                </span>
                              );
                            }
                            if (display.kind === "current") {
                              return (
                                <span className="text-sm text-muted-foreground">
                                  {" ("}
                                  {display.party.shortName}
                                  {")"}
                                </span>
                              );
                            }
                            if (
                              display.kind === "unknown" &&
                              display.reason === "pre-dates-current-party"
                            ) {
                              return (
                                <span
                                  className="text-sm text-muted-foreground italic"
                                  title={`Parti actuel (${display.currentPartyName}) fondé en ${display.currentPartyFoundedDate?.getFullYear()}, soit après la date des faits.`}
                                >
                                  {" (parti à l'époque non renseigné)"}
                                </span>
                              );
                            }
                            return null;
                          })()}

                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {stripMarkdown(affair.description)}
                          </p>

                          {AFFAIR_STATUS_NEEDS_PRESUMPTION[affair.status] &&
                            (affair.involvement === "DIRECT" ||
                              affair.involvement === "INDIRECT") && (
                              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mt-3 inline-block">
                                Présomption d&apos;innocence : affaire en cours
                              </p>
                            )}
                        </div>

                        <div className="text-sm text-muted-foreground md:text-right md:min-w-[150px]">
                          {affair.sentence && (
                            <p className="font-medium text-foreground mb-2">{affair.sentence}</p>
                          )}
                          <p className="mb-2">
                            {affair.sources.length} source
                            {affair.sources.length !== 1 ? "s" : ""}
                          </p>
                          <Link
                            href={`/affaires/${affair.slug}`}
                            className="text-primary hover:underline text-xs"
                          >
                            Voir détails →
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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
                {searchFilter || certaintyFilter || superCatFilter ? " avec ces filtres" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Les affaires sont ajoutées avec des sources vérifiables. Notre base est enrichie
                régulièrement et ne prétend pas à l&apos;exhaustivité.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info box */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-2">À propos des données</h3>
            <p className="text-sm text-blue-800">
              Chaque affaire est documentée avec au minimum une source vérifiable (article de
              presse, décision de justice). La présomption d&apos;innocence est systématiquement
              rappelée pour les affaires en cours. Les informations proviennent de sources publiques
              : Wikidata, articles de presse, décisions de justice publiées.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
