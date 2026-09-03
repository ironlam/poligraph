import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/utils";
import { AdminDeleteButton } from "@/components/admin/AdminDeleteButton";
import { PressPurgeButton } from "@/components/admin/PressPurgeButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { Prisma } from "@/generated/prisma";
import { parsePageParam } from "@/lib/data/query-params";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    source?: string;
    mention?: string;
    page?: string;
  }>;
}

const ITEMS_PER_PAGE = 20;

async function getArticles(params: {
  search?: string;
  source?: string;
  mention?: string;
  page: number;
}) {
  const where: Prisma.PressArticleWhereInput = {};

  if (params.search) {
    where.title = { contains: params.search, mode: "insensitive" };
  }

  if (params.source) {
    where.feedSource = params.source;
  }

  if (params.mention === "none") {
    where.aiAnalyzedAt = { not: null, lt: new Date(Date.now() - 60 * 60 * 1000) };
    where.mentions = { none: {} };
    where.partyMentions = { none: {} };
  }

  const [articles, total] = await Promise.all([
    db.pressArticle.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (params.page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
      select: {
        id: true,
        title: true,
        url: true,
        feedSource: true,
        publishedAt: true,
        mentions: {
          select: {
            id: true,
            politician: { select: { slug: true, fullName: true } },
          },
        },
        _count: { select: { mentions: true } },
      },
    }),
    db.pressArticle.count({ where }),
  ]);

  return { articles, total, totalPages: Math.ceil(total / ITEMS_PER_PAGE) };
}

async function getStats() {
  const [total, totalMentions, topSources, purgeableCount] = await Promise.all([
    db.pressArticle.count(),
    db.pressArticleMention.count(),
    db.pressArticle.groupBy({
      by: ["feedSource"],
      _count: true,
      orderBy: { _count: { feedSource: "desc" } },
      take: 5,
    }),
    db.pressArticle.count({
      where: {
        aiAnalyzedAt: { not: null, lt: new Date(Date.now() - 60 * 60 * 1000) },
        mentions: { none: {} },
        partyMentions: { none: {} },
      },
    }),
  ]);

  return { total, totalMentions, topSources, purgeableCount };
}

async function getSources() {
  const sources = await db.pressArticle.groupBy({
    by: ["feedSource"],
    _count: true,
    orderBy: { _count: { feedSource: "desc" } },
  });
  return sources.map((s) => ({ name: s.feedSource, count: s._count }));
}

export default async function AdminPressePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parsePageParam(params.page);

  const [{ articles, total, totalPages }, stats, sources] = await Promise.all([
    getArticles({ search: params.search, source: params.source, mention: params.mention, page }),
    getStats(),
    getSources(),
  ]);

  const hasFilters = !!(params.search || params.source || params.mention);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Presse et articles"
        description={`${stats.total} articles, ${stats.totalMentions} mentions`}
        action={
          stats.purgeableCount > 0 ? <PressPurgeButton count={stats.purgeableCount} /> : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Articles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-primary">
              {stats.totalMentions}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Mentions</p>
          </CardContent>
        </Card>
        {stats.topSources.slice(0, 2).map((s) => (
          <Card key={s.feedSource}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold tabular-nums">{s._count}</div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.feedSource}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex-1 min-w-[200px]">
          <input
            type="search"
            name="search"
            placeholder="Rechercher un article..."
            defaultValue={params.search}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
          />
          {params.source && <input type="hidden" name="source" value={params.source} />}
        </form>

        <div className="flex items-center gap-2">
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={{
                  pathname: "/admin/presse",
                  query: { ...params, source: undefined, page: undefined },
                }}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  !params.source
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                Toutes ({stats.total})
              </Link>
              {sources.slice(0, 8).map((s) => (
                <Link
                  key={s.name}
                  href={{
                    pathname: "/admin/presse",
                    query: { ...params, source: s.name, page: undefined },
                  }}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    params.source === s.name
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {s.name} ({s.count})
                </Link>
              ))}
              <Link
                href={{
                  pathname: "/admin/presse",
                  query: {
                    ...params,
                    mention: params.mention === "none" ? undefined : "none",
                    page: undefined,
                  },
                }}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  params.mention === "none"
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "border-border hover:bg-muted"
                }`}
              >
                Sans mention ({stats.purgeableCount})
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm text-muted-foreground">
              {total} article{total !== 1 ? "s" : ""} trouvé{total !== 1 ? "s" : ""}
            </span>
            {totalPages > 1 && (
              <span className="text-xs text-muted-foreground">
                Page {page}/{totalPages}
              </span>
            )}
          </div>

          {articles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Article</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Mentions</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {articles.map((article) => (
                    <tr key={article.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-md">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline line-clamp-2 text-primary"
                        >
                          {article.title}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{article.feedSource}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {article.mentions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {article.mentions.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted rounded-full"
                              >
                                <Link
                                  href={`/politiques/${m.politician.slug}`}
                                  className="hover:underline"
                                  prefetch={false}
                                >
                                  {m.politician.fullName}
                                </Link>
                                <AdminDeleteButton
                                  endpoint={`/api/admin/presse/mentions/${m.id}`}
                                  label="Délier"
                                  confirmMessage={`Délier ${m.politician.fullName} de cet article ?`}
                                  size="icon"
                                />
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateShort(article.publishedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <AdminDeleteButton
                          endpoint={`/api/admin/presse/${article.id}`}
                          confirmMessage={`Supprimer l'article "${article.title.slice(0, 60)}..." et toutes ses mentions ?`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {hasFilters ? "Aucun article trouvé avec ces critères" : "Aucun article enregistré"}
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
                  pathname: "/admin/presse",
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
                    pathname: "/admin/presse",
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
                  pathname: "/admin/presse",
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
