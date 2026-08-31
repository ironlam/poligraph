import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { DefinedTermJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { getPresidentialReaderGuide } from "@/lib/data/presidential-reader-guides";
import {
  presidentialReaderGuidePath,
  presidentialReaderGuidesPath,
} from "@/lib/presidentielle/reader-guide-paths";
import { truncateAtWord } from "@/lib/presidentielle/measure-seo";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";

export const revalidate = 86400;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getPresidentialReaderGuide(PRESIDENTIELLE_2027_SLUG, slug);
  if (!guide) {
    return { title: "Repère indisponible | Poligraph", robots: { index: false, follow: true } };
  }
  const canonical = presidentialReaderGuidePath(guide.slug);
  return {
    title: `${guide.label} : définition et mesures | Présidentielle 2027`,
    description: truncateAtWord(
      `${guide.definition} Retrouvez les mesures de la présidentielle 2027 qui emploient ce terme.`,
      155
    ),
    robots: guide.indexable ? undefined : { index: false, follow: true },
    alternates: { canonical },
  };
}

export default async function PresidentialReaderGuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = await getPresidentialReaderGuide(PRESIDENTIELLE_2027_SLUG, slug);
  if (!guide) notFound();

  const canonical = presidentialReaderGuidePath(guide.slug);
  const groupedByCandidate = new Map<string, typeof guide.measures>();
  for (const measure of guide.measures) {
    const current = groupedByCandidate.get(measure.candidateSlug) ?? [];
    current.push(measure);
    groupedByCandidate.set(measure.candidateSlug, current);
  }

  return (
    <main className="pb-14">
      <DefinedTermJsonLd
        name={guide.label}
        description={guide.definition}
        alternateNames={guide.aliases}
        sourceUrl={guide.sourceUrl}
        url={`${SITE_URL}${canonical}`}
        termSetUrl={`${SITE_URL}${presidentialReaderGuidesPath()}`}
      />
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Repères", href: presidentialReaderGuidesPath() },
          { label: guide.label },
        ]}
      />

      <article className="container mx-auto max-w-6xl px-4">
        <header className="max-w-4xl border-b border-border pb-8 pt-3">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
            Repère pour comprendre
          </p>
          <h1 className="mt-3 max-w-[28ch] font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            {guide.label}
          </h1>
          <p className="mt-5 max-w-[76ch] text-lg leading-relaxed text-foreground">
            {guide.definition}
          </p>
          {guide.aliases.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Aussi recherché sous : {guide.aliases.join(", ")}.
            </p>
          )}
          <a
            href={guide.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Consulter ${guide.sourceLabel}, source publiée par ${guide.sourcePublisher}, lien externe`}
            className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Source : {guide.sourcePublisher}
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
          <p className="text-xs text-muted-foreground">
            Définition vérifiée le {formatDate(guide.reviewedAt)}
          </p>
        </header>

        <section aria-labelledby="themes-title" className="border-b border-border py-8">
          <h2 id="themes-title" className="font-display text-2xl font-extrabold">
            Thèmes concernés
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {guide.themes.map((theme) => (
              <li key={theme.theme}>
                <Link
                  href={`/elections/presidentielle-2027/themes/${theme.slug}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {theme.label} · {theme.measureCount}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="measures-title" className="py-8">
          <h2 id="measures-title" className="font-display text-2xl font-extrabold">
            Mesures qui mentionnent ce terme
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {guide.measures.length}{" "}
            {guide.measures.length === 1 ? "mesure publiée" : "mesures publiées"} par{" "}
            {guide.candidateCount} {guide.candidateCount === 1 ? "candidat" : "candidats"}. Ce
            regroupement décrit la présence du terme, sans évaluer les propositions.
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {[...groupedByCandidate.entries()].map(([candidateSlug, measures]) => {
              const candidate = measures[0]!;
              return (
                <section
                  key={candidateSlug}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <h3 className="font-display text-xl font-bold">
                    <Link
                      href={`/elections/presidentielle-2027/candidats/${candidateSlug}`}
                      className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {candidate.candidateName}
                    </Link>
                  </h3>
                  {candidate.partyLabel && (
                    <p className="mt-1 text-sm text-muted-foreground">{candidate.partyLabel}</p>
                  )}
                  <ul className="mt-4 divide-y divide-border">
                    {measures.map((measure) => (
                      <li key={measure.slug} className="py-3 first:pt-0 last:pb-0">
                        <Link
                          href={`/elections/presidentielle-2027/mesures/${measure.slug}`}
                          className="leading-relaxed text-foreground underline decoration-border underline-offset-2 hover:text-primary hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {measure.text}
                        </Link>
                        <Link
                          href={`/elections/presidentielle-2027/themes/${measure.themeSlug}`}
                          className="mt-1 block min-h-11 py-2 text-xs font-semibold text-muted-foreground-strong hover:text-primary hover:underline"
                        >
                          {measure.themeLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-border pt-6">
          <Link
            href={presidentialReaderGuidesPath()}
            className="inline-flex min-h-11 items-center font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Voir tous les repères de la présidentielle 2027
          </Link>
        </footer>
      </article>
    </main>
  );
}
