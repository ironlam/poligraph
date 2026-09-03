import Link from "next/link";
import { redirect } from "next/navigation";
import { PUBLICATION_STATE_LABELS } from "@/config/labels";
import type { ThemeCategory } from "@/generated/prisma";
import { isAuthenticated } from "@/lib/auth";
import type { PublicationState } from "@/lib/measures/moderation-state";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { BatchPublishPanel } from "./_components/BatchPublishPanel";
import { BatchReviewPanel } from "./_components/BatchReviewPanel";
import { QueueFilters, type QueueFilterState } from "./_components/QueueFilters";
import { QueueTable } from "./_components/QueueTable";
import { ContextGenerationBatchPanel } from "./_components/ContextGenerationBatchPanel";
import { EnrichmentCoveragePanel } from "./_components/EnrichmentCoveragePanel";
import { buttonVariants } from "@/components/ui/button";
import { filterMeasureContextCandidateIds } from "@/lib/measures/context-generation";
import { cn } from "@/lib/utils";
import { queryBatchPublishGroups } from "./_data/batch-publish-query";
import { queryBatchReviewGroups } from "./_data/batch-review-query";
import { queryMeasureEnrichmentCoverage } from "./_data/enrichment-coverage-query";
import {
  listMeasureQueueCandidates,
  queryMeasureQueue,
  type EnrichmentState,
} from "./_data/queue-query";

export const metadata = {
  title: "Mesures : relecture (admin)",
  robots: { index: false },
};

const PAGE_SIZE = 25;

const PUBLICATION_KEYS = Object.keys(PUBLICATION_STATE_LABELS) as PublicationState[];
const THEME_KEYS: readonly ThemeCategory[] = THEMES_IN_ORDER;
const ENRICHMENT_KEYS: readonly EnrichmentState[] = [
  "SUBTOPICS_PENDING",
  "SUBTOPICS_APPROVED",
  "DETAILS_MISSING",
];

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
  const enrichmentParam = asString(params.enrichissement);
  const enrichment = ENRICHMENT_KEYS.includes(enrichmentParam as EnrichmentState)
    ? (enrichmentParam as EnrichmentState)
    : undefined;
  const candidacyId = asString(params.candidat);
  const q = asString(params.q);
  const publicCorpus =
    asString(params.corpus) === "presidentielle-2027" ? "PRESIDENTIELLE_2027" : undefined;

  const pageParam = Number(asString(params.page) ?? "1");
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.trunc(pageParam)) : 1;

  const [result, candidates, batchReviewGroups, batchPublishGroups, enrichmentCoverage] =
    await Promise.all([
      queryMeasureQueue({
        publication,
        theme,
        candidacyId,
        withdrawn,
        anomaliesOnly,
        enrichment,
        publicCorpus,
        q,
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      listMeasureQueueCandidates(),
      queryBatchReviewGroups({ candidacyId }),
      queryBatchPublishGroups({ candidacyId }),
      queryMeasureEnrichmentCoverage(),
    ]);

  const current: QueueFilterState = {
    publication,
    theme,
    candidacyId,
    anomaliesOnly,
    enrichment,
    withdrawn,
    q,
    publicCorpus,
  };
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const contextCandidateIds =
    enrichment === "DETAILS_MISSING"
      ? await filterMeasureContextCandidateIds(
          result.rows.map((row) => row.id),
          10
        )
      : [];
  const firstMeasure = result.rows[0];
  const enrichmentWorkflow =
    enrichment === "SUBTOPICS_PENDING"
      ? {
          title: "Sous-thèmes à valider",
          description:
            "Examinez les propositions une mesure après l’autre. Rien ne devient public sans validation humaine.",
          action: "Valider les sous-thèmes de la première mesure",
          hash: "#subtopics-heading",
        }
      : enrichment === "DETAILS_MISSING"
        ? {
            title: "Contextes à compléter",
            description:
              "Ajoutez uniquement les éléments factuels présents dans les sources de la mesure.",
            action: "Compléter le contexte de la première mesure",
            hash: "#actions-heading",
          }
        : enrichment === "SUBTOPICS_APPROVED"
          ? {
              title: "Sous-thèmes validés",
              description:
                "Consultez les rattachements déjà validés et leur révision de référence.",
              action: "Consulter la première mesure",
              hash: "#subtopics-heading",
            }
          : null;

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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/mesures/reperes"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Repères pour comprendre
          </Link>
          <Link
            href="/admin/mesures/nouvelle"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Nouvelle mesure
          </Link>
        </div>
      </header>

      {result.scanCapped && (
        <p
          role="status"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          Les compteurs et les filtres d&apos;étape portent sur les 500 premières mesures de la
          sélection, pas sur la totalité. Restreindre par thème ou par candidature pour retrouver
          des chiffres complets.
        </p>
      )}

      <EnrichmentCoveragePanel coverage={enrichmentCoverage} />

      {enrichment === "DETAILS_MISSING" && (
        <ContextGenerationBatchPanel measureIds={contextCandidateIds} />
      )}

      {enrichmentWorkflow !== null && firstMeasure !== undefined ? (
        <section
          aria-labelledby="enrichment-workflow-title"
          className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="enrichment-workflow-title" className="font-display text-lg font-bold">
              {enrichmentWorkflow.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground-strong">
              {enrichmentWorkflow.description}
            </p>
          </div>
          <Link
            href={`/admin/mesures/${firstMeasure.id}${enrichmentWorkflow.hash}`}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "default" }),
              "min-h-11 shrink-0 whitespace-normal text-center"
            )}
          >
            {enrichmentWorkflow.action}
          </Link>
        </section>
      ) : null}

      <QueueFilters current={current} result={result} candidates={candidates} />

      <BatchReviewPanel groups={batchReviewGroups} />

      <BatchPublishPanel groups={batchPublishGroups} />

      <QueueTable rows={result.rows} activeEnrichment={enrichment} />

      {totalPages > 1 && (
        <nav className="flex flex-wrap justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => {
            const query = new URLSearchParams();
            for (const state of publication) query.append("etat", state);
            for (const key of theme) query.append("theme", key);
            if (candidacyId) query.set("candidat", candidacyId);
            if (anomaliesOnly) query.set("anomalies", "1");
            if (enrichment) query.set("enrichissement", enrichment);
            if (withdrawn) query.set("retrait", withdrawn);
            if (q) query.set("q", q);
            if (publicCorpus === "PRESIDENTIELLE_2027") {
              query.set("corpus", "presidentielle-2027");
            }
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
