import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import {
  CANDIDACY_STATUS_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { searchPresidentialCorpus } from "@/lib/presidentielle/corpus-search";
import { PRESIDENTIELLE_2027_SLUG, themeToSlug } from "@/lib/presidentielle/themes";

const PAGE_PATH = "/elections/presidentielle-2027/recherche";

export const metadata: Metadata = {
  title: "Recherche dans le corpus présidentielle 2027 | Poligraph",
  description: "Rechercher les personnalités suivies et les mesures publiques du corpus 2027.",
  robots: { index: false, follow: true },
  alternates: { canonical: PAGE_PATH },
};

export default async function PresidentialSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    "sous-theme"?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = raw?.trim().slice(0, 200) ?? "";
  const rawSubtopic = Array.isArray(params["sous-theme"])
    ? params["sous-theme"][0]
    : params["sous-theme"];
  const subtopicSlug = rawSubtopic?.trim().slice(0, 100) || undefined;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const result = await searchPresidentialCorpus(PRESIDENTIELLE_2027_SLUG, query, 50, {
    subtopicSlug,
    page,
    strategy: subtopicSlug ? "lexical" : "hybrid",
  });
  const hasResults = result !== null && result.total > 0;
  const hasSearch = query.length >= 2 || subtopicSlug !== undefined;
  const resultLabel = result?.query || query;
  const measuresByThemeAndCandidate = new Map<
    NonNullable<typeof result>["measures"][number]["theme"],
    Map<string, NonNullable<typeof result>["measures"]>
  >();
  for (const measure of result?.measures ?? []) {
    const candidates = measuresByThemeAndCandidate.get(measure.theme) ?? new Map();
    const measures = candidates.get(measure.candidateName) ?? [];
    measures.push(measure);
    candidates.set(measure.candidateName, measures);
    measuresByThemeAndCandidate.set(measure.theme, candidates);
  }
  const comparisonCandidates = [
    ...new Map(
      [
        ...(result?.candidacies ?? []).map((candidacy) => ({
          candidateSlug: candidacy.slug,
          candidateName: candidacy.name,
        })),
        ...(result?.measures ?? []).flatMap((measure) =>
          measure.candidateSlug
            ? [{ candidateSlug: measure.candidateSlug, candidateName: measure.candidateName }]
            : []
        ),
      ].map((candidate) => [candidate.candidateSlug, candidate] as const)
    ).values(),
  ].slice(0, 2);
  const comparisonParams = new URLSearchParams();
  for (const measure of comparisonCandidates) {
    comparisonParams.append("candidat", measure.candidateSlug);
  }
  if (measuresByThemeAndCandidate.size === 1) {
    const [theme] = new Set((result?.measures ?? []).map((measure) => measure.theme));
    if (theme) comparisonParams.set("theme", themeToSlug(theme));
  }

  return (
    <main className="container mx-auto px-4 pb-12 pt-4">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Recherche" },
        ]}
      />
      <div className="mx-auto max-w-4xl">
        <Link
          href="/elections/presidentielle-2027"
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Retour au hub
        </Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Résultats dans le corpus 2027
        </h1>

        <form role="search" className="mt-6" action={PAGE_PATH}>
          <label htmlFor="full-corpus-query" className="block font-bold">
            Rechercher une mesure ou une personnalité suivie
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="full-corpus-query"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="logement, retraites, une personnalité…"
              aria-describedby="full-corpus-examples full-corpus-ai-notice"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Rechercher
            </button>
          </div>
        </form>
        <p id="full-corpus-examples" className="mt-3 text-sm text-muted-foreground">
          Exemples : « Comment réduire les déserts médicaux ? », « Que propose Marine Le Pen sur les
          transports ? »
        </p>
        <p id="full-corpus-ai-notice" className="mt-2 text-sm text-muted-foreground">
          Lors d’une recherche complète, le texte saisi peut être transmis à Mistral AI pour
          retrouver des formulations proches. L’IA ne rédige pas la réponse et ne classe pas les
          candidats. <Link href="/sources#intelligence-artificielle">En savoir plus</Link>
        </p>

        {!hasSearch ? (
          <p className="mt-10 text-muted-foreground">
            Saisissez au moins deux caractères pour rechercher dans le corpus public.
          </p>
        ) : !hasResults ? (
          <section className="mt-10 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-2xl font-extrabold">
              {subtopicSlug
                ? "Aucune mesure publiée dans ce sous-thème"
                : `Aucun résultat pour « ${resultLabel} »`}
            </h2>
            <p className="mt-3 text-muted-foreground">
              Le corpus public de Poligraph ne contient, à ce jour, aucune mesure publiée ni
              personnalité suivie correspondant à cette recherche. Cette absence ne prouve pas qu
              {"'"}une proposition n{"'"}existe pas : elle dit ce que notre corpus contient.
            </p>
          </section>
        ) : (
          <div className="mt-10 space-y-10">
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {result.total} résultat{result.total > 1 ? "s" : ""} dans le corpus public
            </p>
            {result.subjects.length > 0 && (
              <section aria-labelledby="full-subjects-title">
                <h2
                  id="full-subjects-title"
                  className="font-display text-2xl font-extrabold tracking-tight"
                >
                  Thématiques
                </h2>
                <ul className="mt-4 space-y-3">
                  {result.subjects.map((subject) => (
                    <li key={subject.theme}>
                      <Link
                        href={subject.url}
                        prefetch={false}
                        className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <span>
                          <span className="block text-lg font-bold">{subject.label}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            Thème du corpus 2027
                          </span>
                        </span>
                        <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {result.candidacies.length > 0 && (
              <section aria-labelledby="full-candidacies-title">
                <h2
                  id="full-candidacies-title"
                  className="font-display text-2xl font-extrabold tracking-tight"
                >
                  Personnalités suivies
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {result.candidacies.map((candidacy) => (
                    <li key={candidacy.id}>
                      <Link
                        href={candidacy.url}
                        prefetch={false}
                        className="flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <PoliticianAvatar
                          photoUrl={candidacy.photoUrl}
                          blobPhotoUrl={candidacy.blobPhotoUrl}
                          fullName={candidacy.name}
                          size="md"
                        />
                        <span className="min-w-0">
                          <span className="block font-bold">{candidacy.name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {CANDIDACY_STATUS_LABELS[candidacy.status]}
                            {candidacy.party ? " · " + candidacy.party : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {result.measures.length > 0 && (
              <section aria-labelledby="full-measures-title">
                <h2
                  id="full-measures-title"
                  className="font-display text-2xl font-extrabold tracking-tight"
                >
                  Mesures
                </h2>
                <div className="mt-5 space-y-8">
                  {[...measuresByThemeAndCandidate].map(([theme, candidates]) => (
                    <section key={theme} aria-labelledby={`theme-${theme}`}>
                      <h3 id={`theme-${theme}`} className="text-xl font-bold">
                        {THEME_CATEGORY_LABELS[theme]}
                      </h3>
                      <div className="mt-4 space-y-6">
                        {[...candidates].map(([candidate, measures]) => (
                          <div key={candidate}>
                            <h4 className="font-bold text-muted-foreground">{candidate}</h4>
                            <ul className="mt-2 space-y-3">
                              {measures.map((measure) => {
                                const source = measure.sourceLabel
                                  ? MEASURE_SOURCE_KIND_LABELS[measure.sourceLabel]
                                  : "Source de la mesure";
                                return (
                                  <li key={measure.id}>
                                    <article className="rounded-2xl border border-border bg-card p-5">
                                      <Link
                                        href={measure.url}
                                        prefetch={false}
                                        className="text-lg font-bold leading-relaxed hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                      >
                                        {measure.text}
                                      </Link>
                                      {measure.sourceUrl && (
                                        <p className="mt-3 text-sm">
                                          <a
                                            href={measure.sourceUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={`${source}, ouvrir dans un nouvel onglet`}
                                            className="font-bold text-primary underline underline-offset-2"
                                          >
                                            {source}
                                          </a>
                                        </p>
                                      )}
                                    </article>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            )}
            {comparisonCandidates.length === 2 && (
              <aside className="rounded-2xl border border-border bg-card p-6">
                <h2 className="font-display text-2xl font-extrabold">Poursuivre la comparaison</h2>
                <p className="mt-2 text-muted-foreground">
                  Placez côte à côte les mesures de {comparisonCandidates[0]!.candidateName} et de{" "}
                  {comparisonCandidates[1]!.candidateName}
                  {measuresByThemeAndCandidate.size === 1 ? " sur ce thème" : ""}.
                </p>
                <Link
                  href={`/elections/presidentielle-2027/comparer?${comparisonParams.toString()}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Comparer ces candidats
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </aside>
            )}
            {result.filter?.type === "subtopic" && result.page && result.totalPages && (
              <SimplePagination
                page={result.page}
                totalPages={result.totalPages}
                buildUrl={(targetPage) => {
                  const search = new URLSearchParams({ "sous-theme": result.filter!.slug });
                  if (targetPage > 1) search.set("page", String(targetPage));
                  return `${PAGE_PATH}?${search.toString()}`;
                }}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
