import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DOSSIER_STATUS_LABELS,
  DOSSIER_STATUS_COLORS,
  DOSSIER_CATEGORY_COLORS,
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_COLORS,
} from "@/config/labels";
import { formatDate } from "@/lib/utils";
import { DossierFilters } from "@/components/admin/DossierFilters";
import type { DossierStatus, ThemeCategory, Prisma } from "@/generated/prisma";
import { parsePageParam } from "@/lib/data/query-params";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    category?: string;
    theme?: string;
    search?: string;
    page?: string;
    hasSummary?: string;
    sort?: string;
  }>;
}

const ITEMS_PER_PAGE = 20;

async function getDossiers(params: {
  status?: DossierStatus;
  category?: string;
  theme?: ThemeCategory;
  search?: string;
  page: number;
  hasSummary?: boolean;
  sort?: string;
}) {
  const where: Prisma.LegislativeDossierWhereInput = {};

  if (params.status) {
    where.status = params.status;
  }

  if (params.category) {
    where.category = params.category;
  }

  if (params.theme) {
    where.theme = params.theme;
  }

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: "insensitive" } },
      { shortTitle: { contains: params.search, mode: "insensitive" } },
      { number: { contains: params.search, mode: "insensitive" } },
    ];
  }

  if (params.hasSummary === true) {
    where.summary = { not: null };
  } else if (params.hasSummary === false) {
    where.summary = null;
  }

  const [dossiers, total] = await Promise.all([
    db.legislativeDossier.findMany({
      where,
      orderBy:
        params.sort === "updated"
          ? [{ updatedAt: "desc" as const }]
          : params.sort === "status"
            ? [{ status: "asc" as const }, { filingDate: "desc" as const }]
            : [{ filingDate: "desc" as const }, { createdAt: "desc" as const }],
      skip: (params.page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
      select: {
        id: true,
        externalId: true,
        title: true,
        shortTitle: true,
        number: true,
        status: true,
        category: true,
        theme: true,
        filingDate: true,
        summary: true,
        summaryDate: true,
        sourceUrl: true,
      },
    }),
    db.legislativeDossier.count({ where }),
  ]);

  return { dossiers, total, totalPages: Math.ceil(total / ITEMS_PER_PAGE) };
}

async function getCategories() {
  const result = await db.legislativeDossier.groupBy({
    by: ["category"],
    _count: true,
    orderBy: { _count: { category: "desc" } },
  });
  return result.filter((r) => r.category).map((r) => ({ name: r.category!, count: r._count }));
}

async function getStats() {
  const [total, withSummary, byStatus] = await Promise.all([
    db.legislativeDossier.count(),
    db.legislativeDossier.count({ where: { summary: { not: null } } }),
    db.legislativeDossier.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  return {
    total,
    withSummary,
    withoutSummary: total - withSummary,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  };
}

export default async function AdminDossiersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const status = params.status as DossierStatus | undefined;
  const hasSummary =
    params.hasSummary === "true" ? true : params.hasSummary === "false" ? false : undefined;

  const themeParam = params.theme as ThemeCategory | undefined;

  const [{ dossiers, total, totalPages }, categories, stats] = await Promise.all([
    getDossiers({
      status,
      category: params.category,
      theme: themeParam,
      search: params.search,
      page,
      hasSummary,
      sort: params.sort,
    }),
    getCategories(),
    getStats(),
  ]);

  const hasFilters = !!(
    params.status ||
    params.category ||
    params.theme ||
    params.search ||
    params.hasSummary
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Dossiers législatifs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.total} dossiers — {stats.withSummary} avec résumé IA
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-emerald-600">
              {stats.withSummary}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Avec résumé IA</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-amber-600">
              {stats.withoutSummary}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Sans résumé</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-primary">
              {stats.byStatus["EN_COURS"] || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">En discussion</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <DossierFilters categories={categories} />

      {/* Results */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm text-muted-foreground">
              {total} dossier{total !== 1 ? "s" : ""} trouvé{total !== 1 ? "s" : ""}
            </span>
            {totalPages > 1 && (
              <span className="text-xs text-muted-foreground">
                Page {page}/{totalPages}
              </span>
            )}
          </div>

          {dossiers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Dossier</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Thème</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Statut</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Résumé IA</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dossiers.map((dossier) => (
                    <tr key={dossier.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-md">
                        <Link
                          href={`/admin/dossiers/${dossier.id}`}
                          className="font-medium hover:underline line-clamp-2"
                        >
                          {dossier.shortTitle || dossier.title}
                        </Link>
                        {dossier.number && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {dossier.number}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {dossier.theme ? (
                          <Badge className={THEME_CATEGORY_COLORS[dossier.theme]}>
                            {THEME_CATEGORY_LABELS[dossier.theme]}
                          </Badge>
                        ) : dossier.category ? (
                          <Badge
                            className={
                              DOSSIER_CATEGORY_COLORS[dossier.category] ||
                              "bg-gray-100 text-gray-800"
                            }
                          >
                            {dossier.category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={DOSSIER_STATUS_COLORS[dossier.status]}>
                          {DOSSIER_STATUS_LABELS[dossier.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {dossier.summary ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            Oui
                            {dossier.summaryDate && (
                              <span className="ml-1 opacity-70">
                                ({formatDate(dossier.summaryDate)})
                              </span>
                            )}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Non
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {dossier.filingDate ? formatDate(dossier.filingDate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {hasFilters ? "Aucun dossier trouvé avec ces critères" : "Aucun dossier enregistré"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {total} résultat{total !== 1 ? "s" : ""} — page {page}/{totalPages}
          </p>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                href={{
                  pathname: "/admin/dossiers",
                  query: { ...params, page: page - 1 },
                }}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Précédent
              </Link>
            )}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              if (pageNum > totalPages) return null;
              return (
                <Link
                  key={pageNum}
                  href={{
                    pathname: "/admin/dossiers",
                    query: { ...params, page: pageNum },
                  }}
                  className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                    pageNum === page
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {pageNum}
                </Link>
              );
            })}
            {page < totalPages && (
              <Link
                href={{
                  pathname: "/admin/dossiers",
                  query: { ...params, page: page + 1 },
                }}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
