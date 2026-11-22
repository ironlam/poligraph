import Link from "next/link";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import { FactcheckThemeValidation } from "@/components/admin/FactcheckThemeValidation";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ScrutinTheme } from "@/config/scrutin-themes";
import {
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  getPublicFactCheckSqlWhere,
} from "@/lib/api/public-contract";
import { parsePageParam } from "@/lib/data/query-params";
import { formatDateShort } from "@/lib/utils";

/**
 * Queue of the fact-check themes proposed by the model (lot 4b). The fact-checks the public block
 * can use come first: a single claimant on a published profile who has voted at least once.
 * Public fact-checks only, the model having classified the allowed sources alone.
 */

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ statut?: string; page?: string }>;
}

type QueueRow = { id: string; useful: boolean };

function queueSql(reviewed: boolean) {
  return Prisma.sql`
    WITH claimant AS (
      SELECT m."factCheckId", min(m."politicianId") AS "politicianId"
      FROM "FactCheckMention" m
      JOIN "Politician" p ON p."id" = m."politicianId"
        AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
      WHERE m."isClaimant"
      GROUP BY m."factCheckId"
      HAVING count(*) = 1
    )
    SELECT fc."id",
      (c."politicianId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "Vote" v WHERE v."politicianId" = c."politicianId"
      )) AS "useful"
    FROM "FactCheck" fc
    LEFT JOIN claimant c ON c."factCheckId" = fc."id"
    WHERE ${getPublicFactCheckSqlWhere("fc")}
      AND fc."themeClassifiedAt" IS NOT NULL
      AND fc."themeReviewedAt" IS ${reviewed ? Prisma.sql`NOT NULL` : Prisma.sql`NULL`}`;
}

export default async function FactcheckThemesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const reviewed = params.statut === "valides";
  const page = parsePageParam(params.page);

  const all = await db.$queryRaw<QueueRow[]>(Prisma.sql`
    SELECT q."id", q."useful" FROM (${queueSql(reviewed)}) q
    JOIN "FactCheck" f ON f."id" = q."id"
    ORDER BY q."useful" DESC, ${reviewed ? Prisma.sql`f."themeReviewedAt" DESC` : Prisma.sql`f."publishedAt" DESC`}`);
  // The counters of the tab on screen come from its own list; only the other tab is counted apart.
  const other = await db.$queryRaw<{ total: bigint; useful: bigint }[]>(Prisma.sql`
    SELECT count(*) AS "total", count(*) FILTER (WHERE o."useful") AS "useful"
    FROM (${queueSql(!reviewed)}) o`);
  const pending = reviewed ? Number(other[0]?.total ?? 0) : all.length;
  const pendingUseful = reviewed
    ? Number(other[0]?.useful ?? 0)
    : all.filter((r) => r.useful).length;
  const reviewedCount = reviewed ? all.length : Number(other[0]?.total ?? 0);

  const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const usefulIds = new Set(slice.filter((r) => r.useful).map((r) => r.id));
  const details = await db.factCheck.findMany({
    where: { id: { in: slice.map((r) => r.id) } },
    select: {
      id: true,
      slug: true,
      title: true,
      claimText: true,
      source: true,
      publishedAt: true,
      theme: true,
      mentions: {
        where: { isClaimant: true },
        select: { politician: { select: { fullName: true } } },
      },
    },
  });
  const byId = new Map(details.map((d) => [d.id, d]));
  const rows = slice.map((r) => byId.get(r.id)).filter((d) => d !== undefined);
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));

  const tabClass =
    "inline-flex min-h-11 items-center rounded-md border px-3 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-semibold";
  const pageHref = (p: number) =>
    `/admin/factchecks/themes?${new URLSearchParams({ ...(reviewed ? { statut: "valides" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/factchecks" className="text-sm text-muted-foreground hover:underline">
          Fact-checks
        </Link>
        <h1 className="text-2xl font-display font-bold tracking-tight">Thèmes des fact-checks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pending} à valider, dont {pendingUseful} utiles au bloc « Ce qu{"'"}il vote sur ce thème
          » ; {reviewedCount} validés. Un fact-check est utile quand son auteur unique, sur une
          fiche publiée, a déjà voté.
        </p>
      </div>

      <nav aria-label="Statut" className="flex gap-2">
        <Link
          href="/admin/factchecks/themes"
          aria-current={reviewed ? undefined : "page"}
          className={tabClass}
        >
          À valider ({pending})
        </Link>
        <Link
          href="/admin/factchecks/themes?statut=valides"
          aria-current={reviewed ? "page" : undefined}
          className={tabClass}
        >
          Validés ({reviewedCount})
        </Link>
      </nav>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          {reviewed ? "Aucun thème validé pour l'instant." : "Aucun thème à valider."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((fc) => (
            <li key={fc.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {usefulIds.has(fc.id) && <Badge>Utile au bloc 7</Badge>}
                <span>{fc.source}</span>
                <span>{formatDateShort(fc.publishedAt)}</span>
                {fc.mentions.length > 0 && (
                  <span>Auteur : {fc.mentions.map((m) => m.politician.fullName).join(", ")}</span>
                )}
              </div>
              {fc.slug ? (
                <Link
                  href={`/factchecks/${fc.slug}`}
                  prefetch={false}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {fc.title}
                </Link>
              ) : (
                <p className="font-medium">{fc.title}</p>
              )}
              <p className="text-sm italic text-muted-foreground">
                &laquo;&nbsp;{fc.claimText}&nbsp;&raquo;
              </p>
              <p className="text-sm">
                {reviewed ? "Thème validé" : "Proposition du modèle"} :{" "}
                <strong>{fc.theme ? THEME_CATEGORY_LABELS[fc.theme] : "aucun thème"}</strong>
              </p>
              <FactcheckThemeValidation
                key={`${fc.id}-${fc.theme ?? "aucun"}`}
                factcheckId={fc.id}
                proposed={fc.theme as ScrutinTheme | null}
                validated={reviewed}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className={tabClass}>
              Précédente
            </Link>
          )}
          <span>
            Page {page} sur {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className={tabClass}>
              Suivante
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
