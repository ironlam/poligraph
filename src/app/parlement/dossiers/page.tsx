import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  DossierStatus as DossierStatusEnum,
  ThemeCategory as ThemeCategoryEnum,
} from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { Card, CardContent } from "@/components/ui/card";
import {
  DossierCard,
  DossierFilterBar,
  DossierPPLStats,
  LegislativeJourney,
} from "@/components/legislation";
import { getPPLStats } from "@/lib/data/legislation";
import {
  DOSSIER_STATUS_LABELS,
  DOSSIER_STATUS_ICONS,
  DOSSIER_STATUS_DESCRIPTIONS,
} from "@/config/labels";
import type { DossierStatus, ThemeCategory } from "@/generated/prisma";
import { ExternalLink, Info } from "lucide-react";
import { SeoIntro } from "@/components/seo/SeoIntro";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { listingRobotsMetadata, hasActiveListingFilter } from "@/lib/seo/listing-robots";
import { DOSSIERS_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { parsePageParam } from "@/lib/data/query-params";

export const revalidate = 300; // ISR: re-check feature flag every 5 minutes

interface PageProps {
  searchParams: Promise<{
    status?: string;
    theme?: string;
    sort?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "Dossiers législatifs suivis",
    description:
      "Suivez les dossiers législatifs à l'Assemblée nationale : textes déposés, en commission, en séance ou adoptés. Résumés simplifiés à partir des données publiques.",
    // Filtered/paginated variants: noindex,follow, canonical consolidates on the hub.
    ...listingRobotsMetadata(hasActiveListingFilter(params, DOSSIERS_LISTING_FILTER_KEYS)),
    alternates: { canonical: "/parlement/dossiers" },
  };
}

const ITEMS_PER_PAGE = 15;

async function getDossiers(status?: string, theme?: string, sort?: string, page = 1) {
  const skip = (page - 1) * ITEMS_PER_PAGE;

  // Whitelist guard: `status` and `theme` arrive raw from the query string, and
  // an out-of-enum value makes Prisma throw mid-stream (200 + empty listing).
  const where: Record<string, unknown> = {};
  const safeStatus = pickEnumValue(status, DossierStatusEnum);
  if (safeStatus) {
    where.status = safeStatus;
  }
  const safeTheme = pickEnumValue(theme, ThemeCategoryEnum);
  if (safeTheme) {
    where.theme = safeTheme;
  }

  const orderBy =
    sort === "updated"
      ? [{ updatedAt: "desc" as const }]
      : sort === "status"
        ? [{ status: "asc" as const }, { filingDate: "desc" as const }]
        : [{ filingDate: "desc" as const }];

  const [dossiers, total] = await Promise.all([
    db.legislativeDossier.findMany({
      where,
      orderBy,
      skip,
      take: ITEMS_PER_PAGE,
      include: {
        _count: {
          select: { amendments: true },
        },
      },
    }),
    db.legislativeDossier.count({ where }),
  ]);

  return {
    dossiers,
    total,
    page,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
  };
}

async function getStatusCounts() {
  const counts = await db.legislativeDossier.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  return Object.fromEntries(counts.map((c) => [c.status, c._count.status]));
}

async function getThemeCounts() {
  const counts = await db.legislativeDossier.groupBy({
    by: ["theme"],
    _count: { theme: true },
    orderBy: { _count: { theme: "desc" } },
  });

  return counts
    .filter((c) => c.theme !== null)
    .map((c) => ({ theme: c.theme as ThemeCategory, count: c._count.theme }));
}

function buildUrl(params: Record<string, string>) {
  const filtered = Object.entries(params).filter(([, v]) => v);
  if (filtered.length === 0) return "/parlement/dossiers";
  return `/parlement/dossiers?${filtered.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

export default async function AssembleePage({ searchParams }: PageProps) {
  if (!(await isFeatureEnabled("ASSEMBLEE_SECTION"))) notFound();

  const params = await searchParams;
  const statusFilter = params.status || "";
  const themeFilter = params.theme || "";
  const sortFilter = params.sort || "";
  const page = parsePageParam(params.page);

  const [{ dossiers, total, totalPages }, statusCounts, themeCounts, pplStats] = await Promise.all([
    getDossiers(statusFilter, themeFilter, sortFilter, page),
    getStatusCounts(),
    getThemeCounts(),
    getPPLStats(),
  ]);

  const totalDossiers = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  // "Open" = not yet at a terminal status (adopté / rejeté / retiré / caduc).
  // A DEPOSE dossier is open but not necessarily examined, so it is counted as
  // "ouvert", not as "en discussion".
  const openStatuses: DossierStatus[] = [
    "DEPOSE",
    "EN_COMMISSION",
    "EN_COURS",
    "CONSEIL_CONSTITUTIONNEL",
  ];
  const openCount = openStatuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
  // "En discussion active" is reserved for the EN_COURS status only (séance,
  // navette, CMP), never the broader open aggregate.
  const discussionCount = statusCounts.EN_COURS || 0;

  return (
    <>
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[{ label: "Parlement", href: "/parlement" }, { label: "Dossiers législatifs" }]}
        />
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🏛️</span>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">
              Les lois en construction
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Comprendre les textes déposés, discutés, amendés ou adoptés au Parlement.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{totalDossiers}</strong> dossiers suivis
            </span>
            <span>
              <strong className="text-foreground">{openCount}</strong> ouverts
            </span>
            <span>
              <strong className="text-primary">{discussionCount}</strong> en discussion active
            </span>
            <a
              href="https://www.assemblee-nationale.fr/dyn/17/dossiers"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary"
            >
              Source : assemblee-nationale.fr
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <SeoIntro
            text={`${totalDossiers.toLocaleString("fr-FR")} dossiers législatifs suivis à l'Assemblée nationale à partir des données publiques (Open Data). Résumés simplifiés, mis à jour régulièrement.`}
          />
        </div>

        {/* Pedagogical callout: what a legislative dossier is, and is not */}
        <Card className="mb-8 bg-muted/40">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  Un dossier législatif retrace le parcours d&apos;un texte : dépôt, examen en
                  commission, séance publique, navette entre l&apos;Assemblée et le Sénat,
                  amendements, votes et éventuelle adoption.
                </p>
                <p>
                  <strong className="text-foreground">
                    Tous les textes déposés ne deviennent pas des lois.
                  </strong>{" "}
                  Un dossier n&apos;est pas forcément une loi adoptée : beaucoup sont amendés,
                  rejetés, retirés ou restent sans suite. Poligraph reprend les données publiques de
                  l&apos;Assemblée nationale et les rend plus lisibles.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* How a bill moves through Parliament */}
        <LegislativeJourney />

        {/* PPL Stats */}
        <DossierPPLStats stats={pplStats} />

        {/* Status legend — placed before the list so badges are understood upfront */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-3">Comprendre les statuts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {(Object.keys(DOSSIER_STATUS_LABELS) as DossierStatus[]).map((status) => (
                <div key={status} className="flex items-start gap-2">
                  <span className="shrink-0">{DOSSIER_STATUS_ICONS[status]}</span>
                  <div>
                    <span className="font-medium">{DOSSIER_STATUS_LABELS[status]}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      &mdash; {DOSSIER_STATUS_DESCRIPTIONS[status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Les statuts sont simplifiés à partir des données disponibles. Le détail officiel reste
              accessible via le lien Assemblée nationale sur chaque dossier.
            </p>
          </CardContent>
        </Card>

        {/* Filter bar */}
        <DossierFilterBar
          currentFilters={{
            status: statusFilter,
            theme: themeFilter,
            sort: sortFilter,
          }}
          statusCounts={statusCounts}
          themeCounts={themeCounts}
        />

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-4">
          {total} résultat{total !== 1 ? "s" : ""}
        </p>

        {/* Dossiers list */}
        {dossiers.length > 0 ? (
          <>
            <div className="space-y-4">
              {dossiers.map((dossier) => (
                <DossierCard
                  key={dossier.id}
                  id={dossier.id}
                  externalId={dossier.externalId}
                  slug={dossier.slug}
                  title={dossier.title}
                  shortTitle={dossier.shortTitle}
                  number={dossier.number}
                  status={dossier.status}
                  category={dossier.category}
                  theme={dossier.theme}
                  summary={dossier.summary}
                  filingDate={dossier.filingDate}
                  adoptionDate={dossier.adoptionDate}
                  sourceUrl={dossier.sourceUrl}
                  amendmentCount={dossier._count.amendments}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {page > 1 && (
                  <Link
                    href={buildUrl({
                      page: String(page - 1),
                      status: statusFilter,
                      theme: themeFilter,
                      sort: sortFilter,
                    })}
                    className="px-4 py-2 border rounded-md hover:bg-muted"
                  >
                    Précédent
                  </Link>
                )}
                <span className="px-4 py-2 text-muted-foreground">
                  Page {page} sur {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildUrl({
                      page: String(page + 1),
                      status: statusFilter,
                      theme: themeFilter,
                      sort: sortFilter,
                    })}
                    className="px-4 py-2 border rounded-md hover:bg-muted"
                  >
                    Suivant
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-2">
                Aucun dossier trouvé
                {statusFilter || themeFilter ? " avec ces filtres" : ""}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info box */}
        <Card className="mt-8 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="pt-6">
            <h2 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              À propos des données
            </h2>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Les dossiers législatifs sont importés depuis le portail Open Data de l&apos;Assemblée
              nationale (data.assemblee-nationale.fr). Cette page présente une vue simplifiée pour
              faciliter la compréhension citoyenne. Pour les détails complets, consultez directement
              le site de l&apos;Assemblée.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
