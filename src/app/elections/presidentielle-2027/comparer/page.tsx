import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDown, ExternalLink, SlidersHorizontal } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MeasureBadge } from "@/components/measures/MeasureBadge";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getPresidentialComparison } from "@/lib/data/presidential-comparison";
import { cn, formatDate } from "@/lib/utils";
import { PresidentialHubNav } from "../_components/PresidentialHubNav";
import { PresidentialSubtopicLink } from "../_components/PresidentialSubtopicLink";

const ELECTION_SLUG = "presidentielle-2027";
const COMPARISON_PATH = `/elections/${ELECTION_SLUG}/comparer`;

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Comparer les programmes, présidentielle 2027 | Poligraph",
  description:
    "Comparer côte à côte les mesures publiées des candidats à la présidentielle 2027, par thème et avec leurs sources.",
  alternates: { canonical: COMPARISON_PATH },
  robots: { index: false, follow: true },
};

type SearchParams = Record<string, string | string[] | undefined>;

function paramsAsArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function comparisonUrl({
  candidateSlugs,
  themeSlug,
  pages,
}: {
  candidateSlugs: string[];
  themeSlug: string;
  pages: Record<string, number>;
}): string {
  const params = new URLSearchParams();
  candidateSlugs.forEach((slug) => params.append("candidat", slug));
  params.set("theme", themeSlug);
  for (const [slug, page] of Object.entries(pages)) {
    if (page > 1 && candidateSlugs.includes(slug)) params.set(`page-${slug}`, String(page));
  }
  return `${COMPARISON_PATH}?${params.toString()}`;
}

export default async function PresidentialComparisonPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const candidatePages = Object.fromEntries(
    Object.entries(rawParams)
      .filter(([key]) => key.startsWith("page-"))
      .map(([key, value]) => [key.slice(5), Number.parseInt(firstParam(value) ?? "1", 10)])
  );
  const comparison = await getPresidentialComparison({
    electionSlug: ELECTION_SLUG,
    candidateSlugs: paramsAsArray(rawParams.candidat),
    themeSlug: firstParam(rawParams.theme),
    candidatePages,
  });
  if (comparison === null) notFound();

  const selectedSlugs = comparison.selectedCandidates.map((candidate) => candidate.slug);
  const selectedTheme = comparison.selectedTheme;

  return (
    <main className="container mx-auto px-4 pb-16 pt-4">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: `/elections/${ELECTION_SLUG}` },
          { label: "Comparer" },
        ]}
      />
      <PresidentialHubNav active="compare" />

      <div className="mt-8 space-y-8">
        <header className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-widest text-brand">
            Présidentielle 2027
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Comparer les mesures des candidats
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground-strong">
            Choisissez deux ou trois candidats et une thématique. Poligraph place leurs mesures
            publiées côte à côte, sans note ni classement.
          </p>
        </header>

        <details
          open={selectedSlugs.length < 2 || selectedTheme === null}
          className="group rounded-2xl border bg-card"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden md:px-6">
            <SlidersHorizontal aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            <span className="font-display text-base font-bold">
              {selectedSlugs.length >= 2 && selectedTheme
                ? "Modifier la comparaison"
                : "Préparer la comparaison"}
            </span>
            {selectedSlugs.length >= 2 && selectedTheme && (
              <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground md:block">
                {comparison.selectedCandidates.map((candidate) => candidate.name).join(", ")},{" "}
                {selectedTheme.label}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className="ml-auto h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <form
            action={COMPARISON_PATH}
            method="get"
            className="grid gap-4 border-t border-border p-4 lg:grid-cols-4 md:p-6"
          >
            {[0, 1, 2].map((index) => (
              <div key={index}>
                <label htmlFor={`candidate-${index}`} className="mb-1.5 block text-sm font-bold">
                  {index === 2 ? "Troisième candidat (facultatif)" : `Candidat ${index + 1}`}
                </label>
                <Select
                  id={`candidate-${index}`}
                  name="candidat"
                  defaultValue={selectedSlugs[index] ?? ""}
                  required={index < 2}
                  className="min-h-11"
                >
                  <option value="">Choisir</option>
                  {comparison.candidateOptions.map((candidate) => (
                    <option key={candidate.candidacyId} value={candidate.slug}>
                      {candidate.name}
                      {candidate.partyLabel ? `, ${candidate.partyLabel}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            <div>
              <label htmlFor="comparison-theme" className="mb-1.5 block text-sm font-bold">
                Thématique
              </label>
              <Select
                id="comparison-theme"
                name="theme"
                defaultValue={selectedTheme?.slug ?? ""}
                required
                className="min-h-11"
              >
                <option value="">Choisir</option>
                {comparison.themes.map((theme) => (
                  <option key={theme.code} value={theme.slug}>
                    {theme.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="lg:col-span-4">
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "default" }), "min-h-11 w-full sm:w-auto")}
              >
                Comparer
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </form>
        </details>

        {selectedSlugs.length < 2 || selectedTheme === null ? (
          <section className="rounded-2xl border border-dashed bg-muted/30 p-6 md:p-8">
            <h2 className="font-display text-xl font-bold">Préparer la comparaison</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground-strong">
              Sélectionnez deux candidats différents et une thématique. Un troisième candidat peut
              être ajouté pour élargir la lecture.
            </p>
          </section>
        ) : (
          <section aria-labelledby="comparison-results" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-brand">Thématique</p>
                <h2 id="comparison-results" className="font-display text-3xl font-extrabold">
                  {selectedTheme.label}
                </h2>
              </div>
              {comparison.lastReviewedAt && (
                <p className="text-xs text-muted-foreground">
                  Dernière revue du corpus le {formatDate(comparison.lastReviewedAt)}
                </p>
              )}
            </div>

            <div
              className={cn(
                "grid items-start gap-4",
                comparison.selectedCandidates.length === 2
                  ? "lg:grid-cols-2"
                  : "lg:grid-cols-2 xl:grid-cols-3"
              )}
            >
              {comparison.selectedCandidates.map((candidate) => (
                <article
                  key={candidate.candidacyId}
                  className="overflow-hidden rounded-2xl border bg-card"
                >
                  <div className="border-b border-border p-4 md:p-5">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 h-10 w-1.5 shrink-0 rounded-full bg-primary"
                        style={
                          candidate.accentColor
                            ? { backgroundColor: candidate.accentColor }
                            : undefined
                        }
                      />
                      <div>
                        <h3 className="font-display text-xl font-extrabold">{candidate.name}</h3>
                        {candidate.partyLabel && (
                          <p className="text-sm text-muted-foreground-strong">
                            {candidate.partyLabel}
                          </p>
                        )}
                        <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">
                          {candidate.totalMeasures}{" "}
                          {candidate.totalMeasures === 1 ? "mesure" : "mesures"}
                          {candidate.totalPages > 1
                            ? `, page ${candidate.page} sur ${candidate.totalPages}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  {candidate.measures.length === 0 ? (
                    <p className="p-4 text-sm leading-relaxed text-muted-foreground-strong md:p-5">
                      Poligraph n&apos;a pas encore trouvé ou traité de mesure publiée sur cette
                      thématique pour cette candidature.
                    </p>
                  ) : (
                    <>
                      <ol className="divide-y divide-border">
                        {candidate.measures.map((measure) => (
                          <li key={measure.id} className="p-4 md:p-5">
                            <p className="text-sm leading-relaxed">{measure.text}</p>
                            {measure.qualifications.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {measure.qualifications.map((qualification) => (
                                  <MeasureBadge key={qualification.id} tier="qualification">
                                    {qualification.label}
                                  </MeasureBadge>
                                ))}
                              </div>
                            )}
                            {measure.subtopics.length > 0 && (
                              <ul aria-label="Sous-thèmes" className="mt-3 flex flex-wrap gap-1.5">
                                {measure.subtopics.map((subtopic) => (
                                  <li key={subtopic.slug}>
                                    <PresidentialSubtopicLink
                                      slug={subtopic.slug}
                                      label={subtopic.label}
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                            {measure.withdrawal !== null && (
                              <p className="mt-3 text-xs text-muted-foreground-strong">
                                Mesure retirée le {formatDate(measure.withdrawal.withdrawnAt)}
                                {measure.withdrawal.sourceUrl !== null && (
                                  <>
                                    {" · "}
                                    <a
                                      href={measure.withdrawal.sourceUrl}
                                      target="_blank"
                                      rel="nofollow noopener noreferrer"
                                      aria-label={`Consulter la source du retrait de la mesure de ${candidate.name}, lien externe`}
                                      className="font-bold text-primary underline"
                                    >
                                      {measure.withdrawal.sourceLabel ?? "Source du retrait"}
                                    </a>
                                  </>
                                )}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-x-4">
                              <Link
                                href={`/elections/${ELECTION_SLUG}/mesures/${measure.slug}`}
                                prefetch={false}
                                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                              >
                                Voir la mesure
                                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                              </Link>
                              {measure.sourceUrl && (
                                <a
                                  href={measure.sourceUrl}
                                  target="_blank"
                                  rel="nofollow noopener noreferrer"
                                  aria-label={`Consulter la source de la mesure de ${candidate.name}, lien externe`}
                                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                                >
                                  Source
                                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                      {candidate.totalPages > 1 && (
                        <nav
                          aria-label={`Pagination des mesures de ${candidate.name}`}
                          className="flex items-center justify-between gap-3 border-t border-border p-4"
                        >
                          {candidate.page > 1 ? (
                            <Link
                              href={comparisonUrl({
                                candidateSlugs: selectedSlugs,
                                themeSlug: selectedTheme.slug,
                                pages: {
                                  ...candidatePages,
                                  [candidate.slug]: candidate.page - 1,
                                },
                              })}
                              prefetch={false}
                              scroll={false}
                              className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline"
                            >
                              Précédentes
                            </Link>
                          ) : (
                            <span />
                          )}
                          {candidate.page < candidate.totalPages && (
                            <Link
                              href={comparisonUrl({
                                candidateSlugs: selectedSlugs,
                                themeSlug: selectedTheme.slug,
                                pages: {
                                  ...candidatePages,
                                  [candidate.slug]: candidate.page + 1,
                                },
                              })}
                              prefetch={false}
                              scroll={false}
                              className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline"
                            >
                              Suivantes
                            </Link>
                          )}
                        </nav>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>

            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Cette vue compare le corpus publié par Poligraph. Une absence indique que nous
              n&apos;avons pas encore trouvé ou traité de mesure correspondante, pas que la
              candidature ne propose rien.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
