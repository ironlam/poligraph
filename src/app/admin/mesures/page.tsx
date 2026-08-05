import Link from "next/link";
import { redirect } from "next/navigation";
import { PUBLICATION_STATE_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ThemeCategory } from "@/generated/prisma";
import { isAuthenticated } from "@/lib/auth";
import type { PublicationState } from "@/lib/measures/moderation-state";
import { QueueFilters, type QueueFilterState } from "./_components/QueueFilters";
import { QueueTable } from "./_components/QueueTable";
import { queryMeasureQueue } from "./_data/queue-query";

export const metadata = {
  title: "Mesures : relecture (admin) | Poligraph",
  robots: { index: false },
};

const PAGE_SIZE = 25;

const PUBLICATION_KEYS = Object.keys(PUBLICATION_STATE_LABELS) as PublicationState[];
const THEME_KEYS = Object.keys(THEME_CATEGORY_LABELS) as ThemeCategory[];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const first = Array.isArray(value) ? value[0] : value;
  return first === "" ? undefined : first;
}

export default async function AdminMeasuresPage({ searchParams }: PageProps) {
  // The admin layout renders its children when the visitor is not authenticated, so it can let
  // the login page through. A page that does not check for itself is therefore served to
  // anonymous requests, and this one shows unreviewed editorial text.
  if (!(await isAuthenticated())) redirect("/admin/login");

  const params = await searchParams;

  const publication = asArray(params.etat).filter((value): value is PublicationState =>
    PUBLICATION_KEYS.includes(value as PublicationState)
  );
  const theme = asArray(params.theme).filter((value): value is ThemeCategory =>
    THEME_KEYS.includes(value as ThemeCategory)
  );
  const retrait = asString(params.retrait);
  const withdrawn = retrait === "only" || retrait === "exclude" ? retrait : undefined;
  const anomaliesOnly = asString(params.anomalies) === "1";
  const q = asString(params.q);

  const pageParam = Number(asString(params.page) ?? "1");
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.trunc(pageParam)) : 1;

  const result = await queryMeasureQueue({
    publication,
    theme,
    withdrawn,
    anomaliesOnly,
    q,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  const current: QueueFilterState = { publication, theme, anomaliesOnly, withdrawn, q };
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Mesures : relecture</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total === 1
              ? "1 mesure correspond aux filtres"
              : `${result.total} mesures correspondent aux filtres`}
            . Ordre : de la plus anciennement saisie à la plus récente.
          </p>
        </div>
        <Link
          href="/admin/mesures/nouvelle"
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Nouvelle mesure
        </Link>
      </header>

      {result.scanCapped && (
        <p
          role="status"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          Les compteurs et les filtres d&apos;étape portent sur les 500 premières mesures de la
          sélection, pas sur la totalité. Restreindre par sujet ou par candidature pour retrouver
          des chiffres complets.
        </p>
      )}

      <QueueFilters current={current} result={result} />

      <QueueTable rows={result.rows} />

      {totalPages > 1 && (
        <nav className="flex flex-wrap justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => {
            const query = new URLSearchParams();
            for (const state of publication) query.append("etat", state);
            for (const key of theme) query.append("theme", key);
            if (anomaliesOnly) query.set("anomalies", "1");
            if (withdrawn) query.set("retrait", withdrawn);
            if (q) query.set("q", q);
            query.set("page", String(number));

            return (
              <Link
                key={number}
                href={`/admin/mesures?${query.toString()}`}
                prefetch={false}
                className={`inline-flex min-h-11 items-center rounded border border-border px-3 py-2 ${
                  number === page ? "bg-muted font-medium" : "hover:bg-muted"
                }`}
                aria-current={number === page ? "page" : undefined}
              >
                {number}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
