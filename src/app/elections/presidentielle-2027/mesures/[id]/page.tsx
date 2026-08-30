import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MarkdownText } from "@/components/ui/markdown";
import { VoteRelationBadge } from "@/components/measures/VoteRelationBadge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import {
  CHAMBER_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  MEASURE_ATTRIBUTION_LABELS,
  SOURCE_TIER_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { getPublicPresidentialMeasureDetail } from "@/lib/data/presidential-measure-detail";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { buildMeasureSeoDescription, truncateAtWord } from "@/lib/presidentielle/measure-seo";
import { themeToSlug } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { PresidentialSubtopicLink } from "../../_components/PresidentialSubtopicLink";

const ELECTION_SLUG = "presidentielle-2027";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const measure = await getPublicPresidentialMeasureDetail(ELECTION_SLUG, id);
  if (measure === null) {
    return {
      title: "Mesure indisponible | Poligraph",
      robots: { index: false, follow: true },
    };
  }
  const canonical = "/elections/" + ELECTION_SLUG + "/mesures/" + measure.slug;
  const themeLabel = THEME_CATEGORY_LABELS[measure.theme];
  return {
    title: `${measure.candidate.name} : ${truncateAtWord(measure.text, 72)} | Présidentielle 2027`,
    description: buildMeasureSeoDescription({
      candidateName: measure.candidate.name,
      themeLabel,
      text: measure.text,
      details: measure.details,
    }),
    alternates: { canonical },
  };
}

export default async function PresidentialMeasurePage({ params }: PageProps) {
  const { id } = await params;
  const measure = await getPublicPresidentialMeasureDetail(ELECTION_SLUG, id);
  if (measure === null) notFound();

  const canonical = "/elections/" + ELECTION_SLUG + "/mesures/" + measure.slug;
  const themeUrl = "/elections/" + ELECTION_SLUG + "/themes/" + themeToSlug(measure.theme);
  const candidateUrl = "/elections/" + ELECTION_SLUG + "/candidats/" + measure.candidate.slug;
  const comparisonUrl =
    "/elections/" +
    ELECTION_SLUG +
    "/comparer?candidat=" +
    encodeURIComponent(measure.candidate.slug) +
    "&theme=" +
    encodeURIComponent(themeToSlug(measure.theme));
  const themeLabel = THEME_CATEGORY_LABELS[measure.theme];
  const seoDescription = buildMeasureSeoDescription({
    candidateName: measure.candidate.name,
    themeLabel,
    text: measure.text,
    details: measure.details,
  });
  const titleClass =
    measure.text.length > 100
      ? "text-2xl sm:text-3xl lg:text-4xl"
      : "text-3xl sm:text-4xl lg:text-5xl";

  return (
    <main className="pb-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Présidentielle 2027", url: `${SITE_URL}/elections/${ELECTION_SLUG}` },
          { name: themeLabel, url: `${SITE_URL}${themeUrl}` },
          { name: measure.text, url: `${SITE_URL}${canonical}` },
        ]}
      />
      <ArticleJsonLd
        headline={measure.text}
        description={seoDescription}
        datePublished={measure.publishedAt.toISOString()}
        dateModified={measure.reviewedAt.toISOString()}
        url={`${SITE_URL}${canonical}`}
        about={{ name: measure.candidate.name, url: `${SITE_URL}${candidateUrl}` }}
      />
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: THEME_CATEGORY_LABELS[measure.theme], href: themeUrl },
          { label: "Mesure", href: canonical },
        ]}
      />
      <article className="container mx-auto max-w-5xl px-4">
        <header className="border-b border-border pb-8 pt-3">
          <Link
            href={themeUrl}
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {themeLabel}
          </Link>
          <h1
            className={`mt-3 max-w-[28ch] font-display font-extrabold leading-[1.08] tracking-tight ${titleClass}`}
          >
            {measure.text}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Revue par Poligraph le {formatDate(measure.reviewedAt)}.{" "}
              <Link
                href="/methodologie/mesures-presidentielle-2027"
                className="font-bold text-primary underline"
              >
                Voir la méthode
              </Link>
            </span>
          </div>
        </header>

        {measure.details !== null && (
          <section aria-labelledby="details-title" className="border-b border-border py-8">
            <h2 id="details-title" className="font-display text-2xl font-extrabold">
              Ce que prévoit la mesure
            </h2>
            <MarkdownText className="mt-4 max-w-[72ch] leading-relaxed text-foreground">
              {measure.details}
            </MarkdownText>
            {measure.sources.length > 0 && (
              <Link
                href="#sources"
                className="mt-3 inline-flex min-h-11 items-center font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Voir les sources utilisées pour ce contexte
              </Link>
            )}
          </section>
        )}

        {measure.subtopics.length > 0 && (
          <section aria-labelledby="concepts-title" className="border-b border-border py-8">
            <h2 id="concepts-title" className="font-display text-2xl font-extrabold">
              Notions abordées
            </h2>
            <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
              Ces repères décrivent les sujets auxquels la mesure a été rattachée après validation
              éditoriale. Ils n&apos;évaluent ni son coût, ni sa faisabilité.
            </p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {measure.subtopics.map((subtopic) => (
                <div key={subtopic.slug} className="rounded-xl border border-border bg-card p-4">
                  <dt>
                    <PresidentialSubtopicLink
                      slug={subtopic.slug}
                      label={subtopic.label}
                      className="justify-start border-0 bg-transparent px-0 font-display text-lg font-bold shadow-none hover:bg-transparent hover:underline"
                    />
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground-strong">
                    {subtopic.description}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {measure.programEdition !== null && (
          <section aria-labelledby="programme-title" className="border-b border-border py-8">
            <h2 id="programme-title" className="font-display text-2xl font-extrabold">
              Dans le programme
            </h2>
            <div className="mt-4 rounded-2xl border border-border bg-card p-5">
              <p className="text-sm font-bold text-muted-foreground">
                {MEASURE_ATTRIBUTION_LABELS[measure.attribution]}
              </p>
              <p className="mt-1 text-lg font-bold">{measure.programEdition.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Document publié le {formatDate(measure.programEdition.publishedAt)}
              </p>
              <a
                href={measure.programEdition.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Consulter le programme ${measure.programEdition.label}, lien externe`}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Consulter le programme complet
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
          </section>
        )}

        <section aria-labelledby="carrier-title" className="py-8">
          <h2 id="carrier-title" className="font-display text-2xl font-extrabold">
            Personnalité porteuse
          </h2>
          <Link
            href={candidateUrl}
            className="mt-4 flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PoliticianAvatar
              photoUrl={measure.candidate.photoUrl}
              blobPhotoUrl={measure.candidate.blobPhotoUrl}
              fullName={measure.candidate.name}
              size="md"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">{measure.candidate.name}</span>
              {measure.candidate.party && (
                <span className="block text-sm text-muted-foreground">
                  {measure.candidate.party}
                </span>
              )}
            </span>
            <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
          </Link>
          <Link
            href={comparisonUrl}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Comparer cette mesure avec celles d&apos;un autre candidat
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>

        {measure.relatedMeasures.length > 0 && (
          <section aria-labelledby="related-title" className="border-t border-border py-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="related-title" className="font-display text-2xl font-extrabold">
                  Ce que proposent d&apos;autres candidates et candidats
                </h2>
                <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
                  Mesures publiées sur {themeLabel.toLocaleLowerCase("fr")}
                  {measure.relatedMeasures.some((related) => related.sharedSubtopics.length > 0)
                    ? ", rapprochées par sous-thème quand cette information a été validée."
                    : "."}{" "}
                  Aucun classement ni jugement de faisabilité n&apos;est appliqué.
                </p>
              </div>
              <Link
                href={themeUrl}
                className="inline-flex min-h-11 items-center gap-2 font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Voir toute la comparaison
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {measure.relatedMeasures.map((related) => (
                <li
                  key={related.slug}
                  className="flex h-full min-h-32 flex-col rounded-2xl border border-border bg-card p-5"
                >
                  <Link
                    href={`/elections/${ELECTION_SLUG}/mesures/${related.slug}`}
                    prefetch={false}
                    className="group min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="block text-sm font-bold text-primary">
                      {related.candidateName}
                      {related.party ? ` · ${related.party}` : ""}
                    </span>
                    <span className="mt-2 line-clamp-3 block leading-relaxed text-foreground group-hover:underline">
                      {related.text}
                    </span>
                  </Link>
                  {related.sharedSubtopics.length > 0 && (
                    <ul aria-label="Sous-thèmes partagés" className="mt-3 flex flex-wrap gap-2">
                      {related.sharedSubtopics.map((subtopic) => (
                        <li key={subtopic.slug}>
                          <PresidentialSubtopicLink slug={subtopic.slug} label={subtopic.label} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          id="sources"
          aria-labelledby="sources-title"
          className="border-t border-border py-8"
        >
          <h2 id="sources-title" className="font-display text-2xl font-extrabold">
            Sources
          </h2>
          <ul className="mt-4 space-y-3">
            {measure.sources.map((source) => (
              <li key={source.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap gap-2 text-sm font-bold">
                  <span>{SOURCE_TIER_LABELS[source.tier]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{MEASURE_SOURCE_KIND_LABELS[source.sourceKind]}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Publiée le {formatDate(source.publishedAt)}
                  {source.page ? " · " + source.page : ""}
                </p>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    "Consulter la source externe : " + MEASURE_SOURCE_KIND_LABELS[source.sourceKind]
                  }
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Consulter la source
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        {measure.votes.length > 0 && (
          <section aria-labelledby="votes-title" className="border-t border-border py-8">
            <h2 id="votes-title" className="font-display text-2xl font-extrabold">
              Votes parlementaires liés
            </h2>
            <ul className="mt-4 space-y-3">
              {measure.votes.map((vote) => {
                const details =
                  vote.scrutin !== null
                    ? CHAMBER_LABELS[vote.scrutin.chamber] +
                      ", " +
                      formatDate(vote.scrutin.votingDate)
                    : "Vérifié le " + formatDate(vote.checkedAt);
                return (
                  <li key={vote.id} className="rounded-2xl border border-border bg-card p-5">
                    {vote.scrutin ? (
                      <Link
                        href={"/parlement/votes/" + (vote.scrutin.slug ?? vote.scrutin.id)}
                        className="inline-flex min-h-11 items-center font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {vote.scrutin.title}
                      </Link>
                    ) : (
                      <p className="font-bold">Recherche de vote documentée</p>
                    )}
                    <VoteRelationBadge
                      relation={vote.relation}
                      basisDetails={details}
                      className="mt-3"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="border-t border-border py-8 text-sm text-muted-foreground">
          <p>
            Cette page décrit le contenu actuellement publié dans le corpus PoliGraph. Elle ne
            constitue ni une appréciation de la mesure, ni une synthèse de l{"'"}ensemble de la
            campagne.
          </p>
          <p className="mt-2">Dernière revue éditoriale : {formatDate(measure.reviewedAt)}</p>
        </footer>
      </article>
    </main>
  );
}
