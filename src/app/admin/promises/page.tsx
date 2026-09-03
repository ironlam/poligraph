import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getPromisesForModeration, getPromiseStats } from "@/lib/data/promises";
import {
  PROMISE_EXTRACTION_STATUS_LABELS,
  PROMISE_SOURCE_KIND_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import type { PromiseExtractionStatus, ThemeCategory } from "@/types";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";
import { parsePageParam } from "@/lib/data/query-params";

export const metadata = { title: "Promesses (admin)", robots: { index: false } };

interface PageProps {
  searchParams: Promise<{ status?: string; theme?: string; page?: string }>;
}

const ITEMS_PER_PAGE = 25;

const STATUS_KEYS = Object.keys(PROMISE_EXTRACTION_STATUS_LABELS) as PromiseExtractionStatus[];
const THEME_KEYS: readonly ThemeCategory[] = LEGACY_THEME_CATEGORIES;

export default async function AdminPromisesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = STATUS_KEYS.includes(params.status as PromiseExtractionStatus)
    ? (params.status as PromiseExtractionStatus)
    : undefined;
  const theme = THEME_KEYS.includes(params.theme as ThemeCategory)
    ? (params.theme as ThemeCategory)
    : undefined;
  const page = parsePageParam(params.page);

  const [result, stats] = await Promise.all([
    getPromisesForModeration({ status, theme, page, pageSize: ITEMS_PER_PAGE }),
    getPromiseStats(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / ITEMS_PER_PAGE));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display font-bold tracking-tight">Promesses : modération</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.total} promesses extraites au total. Filtrer pour voir celles en attente de revue.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/promises"
            prefetch={false}
            className={`px-3 py-1.5 rounded border hover:bg-muted ${!status ? "bg-muted font-medium" : ""}`}
          >
            Toutes
          </Link>
          {STATUS_KEYS.map((key) => (
            <Link
              key={key}
              href={`/admin/promises?status=${key}`}
              prefetch={false}
              className={`px-3 py-1.5 rounded border hover:bg-muted ${status === key ? "bg-muted font-medium" : ""}`}
            >
              {PROMISE_EXTRACTION_STATUS_LABELS[key]}
            </Link>
          ))}
        </div>
      </Card>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Politicien</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Texte</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Thème</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Statut</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link
                    href={`/politiques/${p.politician.slug}`}
                    prefetch={false}
                    className="text-primary hover:underline"
                  >
                    {p.politician.fullName}
                  </Link>
                </td>
                <td className="px-3 py-2 max-w-md">
                  <span className="line-clamp-2">{p.text}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{THEME_CATEGORY_LABELS[p.theme]}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {PROMISE_SOURCE_KIND_LABELS[p.sourceKind]}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {PROMISE_EXTRACTION_STATUS_LABELS[p.extractionStatus]}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/promises/${p.id}`}
                    prefetch={false}
                    className="text-primary hover:underline"
                  >
                    Réviser
                  </Link>
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Aucune promesse.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex flex-wrap gap-2 justify-center" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => {
            const query = new URLSearchParams();
            if (status) query.set("status", status);
            if (theme) query.set("theme", theme);
            query.set("page", String(n));
            return (
              <Link
                key={n}
                href={`/admin/promises?${query.toString()}`}
                prefetch={false}
                className={`px-3 py-1 rounded border ${n === page ? "bg-muted font-medium" : "hover:bg-muted"}`}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
