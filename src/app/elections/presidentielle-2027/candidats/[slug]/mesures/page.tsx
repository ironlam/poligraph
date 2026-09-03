import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { THEME_ACCENT_BAR, THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ThemeCategory } from "@/generated/prisma";
import { getPublicElectionIdentity } from "@/lib/data/presidential-candidacy-field";
import { parseStrictPagination } from "@/lib/api/pagination";
import {
  getPublicMeasureSubtopicCountsByCandidacy,
  listPublicPresidentialMeasures,
} from "@/lib/data/measures";
import { getPoliticianPresidentialCandidacy } from "@/lib/data/politician-candidacy";
import { getPolitician } from "@/lib/data/politicians";
import { parseThemeSlug, THEMES_IN_ORDER, themeToSlug } from "@/lib/presidentielle/themes";
import { cn } from "@/lib/utils";
import { PresidentialSubtopicLink } from "../../../_components/PresidentialSubtopicLink";

const ELECTION_SLUG = "presidentielle-2027";
const PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_QUERY_LENGTH = 120;
const THEME_ENTRIES = THEMES_IN_ORDER.map(
  (theme) => [theme, THEME_CATEGORY_LABELS[theme]] as const
);

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function measuresPath(candidateSlug: string): string {
  return `/elections/${ELECTION_SLUG}/candidats/${candidateSlug}/mesures`;
}

function buildMeasuresUrl(
  candidateSlug: string,
  values: { theme?: ThemeCategory; subtopic?: string; query?: string; page?: number }
): string {
  const params = new URLSearchParams();
  if (values.theme) params.set("theme", themeToSlug(values.theme));
  if (values.subtopic) params.set("sous-theme", values.subtopic);
  if (values.query) params.set("q", values.query);
  if (values.page && values.page > 1) params.set("page", String(values.page));
  const queryString = params.toString();
  return `${measuresPath(candidateSlug)}${queryString ? `?${queryString}` : ""}`;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const politician = await getPolitician(slug);
  if (!politician) return { robots: { index: false, follow: true } };
  const candidacy = await getPoliticianPresidentialCandidacy(politician.id);

  const canonical = measuresPath(slug);
  const hasUtilityParams = Object.values(rawSearchParams).some((value) => value !== undefined);
  return {
    title: `Mesures de ${politician.fullName}, présidentielle 2027`,
    description: `Explorer les mesures documentées de ${politician.fullName} par thème, avec leurs sources.`,
    alternates: { canonical },
    robots:
      hasUtilityParams || !candidacy || candidacy.primarySourceMeasureCount === 0
        ? { index: false, follow: true }
        : undefined,
  };
}

export default async function CandidateMeasuresPage({ params, searchParams }: PageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const [politician, election] = await Promise.all([
    getPolitician(slug),
    getPublicElectionIdentity(ELECTION_SLUG),
  ]);
  if (!politician || !election) notFound();

  const candidacy = await getPoliticianPresidentialCandidacy(politician.id);
  if (!candidacy || candidacy.primarySourceMeasureCount === 0) notFound();

  const rawTheme = firstParam(rawSearchParams.theme);
  const parsedTheme = rawTheme ? parseThemeSlug(rawTheme) : undefined;
  const query = (firstParam(rawSearchParams.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const rawSubtopic =
    firstParam(rawSearchParams["sous-theme"]) ?? firstParam(rawSearchParams["sous-sujet"]);
  const paginationParams = new URLSearchParams();
  const rawPage = firstParam(rawSearchParams.page);
  if (rawPage) paginationParams.set("page", rawPage);
  const page =
    parseStrictPagination(paginationParams, {
      defaultLimit: PAGE_SIZE,
      maxLimit: PAGE_SIZE,
      maxPage: MAX_PAGE,
    })?.page ?? 1;

  if (rawTheme && !parsedTheme) {
    redirect(buildMeasuresUrl(slug, { query: query || undefined }));
  }
  const theme: ThemeCategory | undefined = parsedTheme ?? undefined;

  const subtopics = await getPublicMeasureSubtopicCountsByCandidacy(candidacy.candidacyId, theme);
  const subtopic =
    rawSubtopic && subtopics.some((item) => item.slug === rawSubtopic) ? rawSubtopic : undefined;
  if (rawSubtopic && !subtopic) {
    redirect(buildMeasuresUrl(slug, { theme, query: query || undefined }));
  }

  const result = await listPublicPresidentialMeasures({
    electionId: election.id,
    electionSlug: election.slug,
    candidateSlug: slug,
    theme,
    subtopicSlug: subtopic,
    query: query || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  if (page > totalPages) {
    redirect(
      buildMeasuresUrl(slug, {
        theme,
        subtopic,
        query: query || undefined,
        page: totalPages,
      })
    );
  }

  const basePath = measuresPath(slug);
  const activeFilterCount =
    Number(Boolean(theme)) + Number(Boolean(subtopic)) + Number(Boolean(query));

  return (
    <main className="pb-16">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: `/elections/${ELECTION_SLUG}` },
          { label: politician.fullName, href: `/elections/${ELECTION_SLUG}/candidats/${slug}` },
          { label: "Mesures" },
        ]}
      />

      <div className="container mx-auto max-w-5xl space-y-8 px-4 pt-3">
        <header className="max-w-3xl">
          <Link
            href={`/elections/${ELECTION_SLUG}/candidats/${slug}`}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-auto min-h-11 justify-start px-0 font-bold"
            )}
          >
            <ArrowLeft aria-hidden="true" />
            Retour à la fiche
          </Link>
          <p className="mt-3 text-sm font-bold uppercase tracking-widest text-brand">
            Présidentielle 2027
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Les mesures de {politician.fullName}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground-strong">
            {candidacy.publishedMeasureCount} mesures documentées et relues. Filtrez le programme
            par thème ou recherchez un terme précis.
          </p>
        </header>

        <details className="group rounded-2xl border bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden sm:px-5">
            <SlidersHorizontal aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            <span className="font-display text-base font-bold">Filtrer et rechercher</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground-strong">
                {activeFilterCount} {activeFilterCount === 1 ? "filtre actif" : "filtres actifs"}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className="ml-auto h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <form
            action={basePath}
            method="get"
            className="grid gap-4 border-t border-border px-4 py-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] sm:px-5"
          >
            <div>
              <label htmlFor="measure-query" className="mb-1.5 block text-sm font-bold">
                Mot ou expression
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="measure-query"
                  name="q"
                  defaultValue={query}
                  maxLength={MAX_QUERY_LENGTH}
                  placeholder="Ex. encadrement des loyers"
                  className="min-h-11 pl-9"
                />
              </div>
            </div>
            <div>
              <label htmlFor="measure-theme" className="mb-1.5 block text-sm font-bold">
                Thème
              </label>
              <Select
                id="measure-theme"
                name="theme"
                defaultValue={theme ? themeToSlug(theme) : ""}
                className="min-h-11"
              >
                <option value="">Toutes les thématiques</option>
                {THEME_ENTRIES.map(([code, label]) => (
                  <option key={code} value={themeToSlug(code)}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="measure-subtopic" className="mb-1.5 block text-sm font-bold">
                Sous-thème
              </label>
              <Select
                id="measure-subtopic"
                name="sous-theme"
                defaultValue={subtopic ?? ""}
                className="min-h-11"
                disabled={subtopics.length === 0}
              >
                <option value="">
                  {subtopics.length === 0 ? "Aucun sous-thème validé" : "Tous les sous-thèmes"}
                </option>
                {subtopics.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="submit"
              className={cn(buttonVariants({ variant: "default" }), "min-h-11 self-end")}
            >
              Filtrer
            </button>
            {activeFilterCount > 0 && (
              <div className="flex items-center md:col-span-2 lg:col-span-4">
                <Link
                  href={basePath}
                  prefetch={false}
                  className={cn(buttonVariants({ variant: "link" }), "min-h-11 px-0")}
                >
                  Effacer les filtres
                </Link>
              </div>
            )}
          </form>
        </details>

        <section aria-labelledby="results-title">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-4">
            <div>
              <h2 id="results-title" className="font-display text-2xl font-extrabold">
                {theme ? THEME_CATEGORY_LABELS[theme] : "Toutes les mesures"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.total} {result.total === 1 ? "résultat" : "résultats"}
                {totalPages > 1 ? `, page ${page} sur ${totalPages}` : ""}
              </p>
            </div>
          </div>

          {result.data.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed bg-muted/30 p-6 sm:p-8">
              <h3 className="font-display text-xl font-bold">Aucune mesure trouvée</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground-strong">
                Essayez un autre terme ou retirez un filtre. La recherche porte actuellement sur les
                mots présents dans les mesures publiées.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {result.data.map((measure) => {
                const detailUrl = measure.publicUrl;
                const source = measure.sources[0];
                return (
                  <li key={measure.measureId} className="py-6 first:pt-5">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-6 w-1.5 shrink-0 rounded-full ${THEME_ACCENT_BAR[measure.theme.code]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground-strong">
                          {measure.theme.label}
                        </p>
                        <p className="mt-2 max-w-[75ch] text-base leading-7">{measure.text}</p>
                        {measure.subtopics.length > 0 && (
                          <ul aria-label="Sous-thèmes" className="mt-3 flex flex-wrap gap-2">
                            {measure.subtopics.map((item) => (
                              <li key={item.slug}>
                                <PresidentialSubtopicLink
                                  slug={item.slug}
                                  label={item.label}
                                  href={buildMeasuresUrl(slug, {
                                    theme: measure.theme.code,
                                    subtopic: item.slug,
                                  })}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                          <Link
                            href={detailUrl}
                            prefetch={false}
                            aria-label={`Voir la mesure : ${measure.text}`}
                            className={cn(
                              buttonVariants({ variant: "link" }),
                              "h-auto min-h-11 justify-start whitespace-normal px-0 text-left font-bold"
                            )}
                          >
                            Voir la mesure
                            <ArrowRight aria-hidden="true" />
                          </Link>
                          {source && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="nofollow noopener noreferrer"
                              aria-label={`Consulter la source externe de la mesure : ${measure.text}`}
                              className={cn(
                                buttonVariants({ variant: "link" }),
                                "h-auto min-h-11 justify-start whitespace-normal px-0 text-left font-bold"
                              )}
                            >
                              Source externe
                              <ExternalLink aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Pagination des mesures"
              className="mt-8 flex flex-wrap justify-center gap-3"
            >
              {page > 1 && (
                <Link
                  href={buildMeasuresUrl(slug, {
                    theme,
                    subtopic,
                    query: query || undefined,
                    page: page - 1,
                  })}
                  prefetch={false}
                  className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
                  rel="prev"
                >
                  <ArrowLeft aria-hidden="true" />
                  Précédent
                </Link>
              )}
              <span
                aria-current="page"
                className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground-strong"
              >
                Page {page} sur {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={buildMeasuresUrl(slug, {
                    theme,
                    subtopic,
                    query: query || undefined,
                    page: page + 1,
                  })}
                  prefetch={false}
                  className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
                  rel="next"
                >
                  Suivant
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
