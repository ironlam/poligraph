import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, PlayCircle, Quote } from "lucide-react";
import { ParliamentThemeBridgeLoader } from "@/components/elections/ParliamentThemeBridgeLoader";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MarkdownText } from "@/components/ui/markdown";
import { MeasureParliamentLinks } from "@/components/measures/MeasureParliamentLinks";
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
import {
  formatTimecode,
  isVideoSource,
  isYouTubeUrl,
  videoSourceHref,
} from "@/config/video-source";
import { buildMeasureSeoDescription, truncateAtWord } from "@/lib/presidentielle/measure-seo";
import { themeToSlug } from "@/lib/presidentielle/themes";
import {
  presidentialReaderGuidePath,
  presidentialReaderGuidesPath,
} from "@/lib/presidentielle/reader-guide-paths";
import { formatDate } from "@/lib/utils";
import { PresidentialSubtopicLink } from "../../_components/PresidentialSubtopicLink";
import { YoutubeBanner } from "@/components/youtube/YoutubeBanner";

const ELECTION_SLUG = "presidentielle-2027";

type PageProps = { params: Promise<{ id: string }> };

// Le titre d'une mesure est une phrase à lire, pas un nom : au-delà de 100 signes, il descend à
// l'échelle d'un titre de section, en graisse 700, pour tenir en trois lignes environ.
const LONG_MEASURE_TITLE_LENGTH = 100;

function measureTitleClass(text: string): string {
  if (text.length > LONG_MEASURE_TITLE_LENGTH) {
    return "max-w-[52ch] text-xl font-bold leading-[1.3] sm:text-2xl";
  }
  return "max-w-[36ch] text-3xl font-extrabold leading-[1.15] sm:text-4xl";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const measure = await getPublicPresidentialMeasureDetail(ELECTION_SLUG, id);
  if (measure === null) {
    return {
      title: "Mesure indisponible",
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
  const titleClass = measureTitleClass(measure.text);

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
      {/* L'ordre du DOM suit les questions du lecteur (qui, quoi, d'où, et les autres) : sur mobile,
          la colonne « En bref » passe juste sous l'en-tête, avant le détail. */}
      <article className="container mx-auto grid max-w-6xl gap-x-10 px-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <header className="pb-6 pt-2 lg:col-start-1">
          <Link
            href={candidateUrl}
            className="inline-flex min-h-11 items-center gap-3 rounded-lg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PoliticianAvatar
              photoUrl={measure.candidate.photoUrl}
              blobPhotoUrl={measure.candidate.blobPhotoUrl}
              fullName={measure.candidate.name}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block font-bold">{measure.candidate.name}</span>
              {measure.candidate.party && (
                <span className="block text-sm text-muted-foreground">
                  {measure.candidate.party}
                </span>
              )}
            </span>
          </Link>
          <Link
            href={themeUrl}
            className="mt-2 flex min-h-11 w-fit items-center text-sm font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {themeLabel}
          </Link>
          <h1 className={`font-display tracking-tight ${titleClass}`}>{measure.text}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Revue par Poligraph le {formatDate(measure.reviewedAt)}.{" "}
            <Link
              href="/methodologie/mesures-presidentielle-2027"
              className="font-bold text-primary underline"
            >
              Voir la méthode
            </Link>
          </p>
        </header>

        <aside
          aria-label="En bref"
          className="flex flex-col gap-4 self-start pb-2 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-2"
        >
          {measure.programEdition !== null && (
            <section
              aria-labelledby="programme-title"
              className="rounded-2xl border border-border bg-card p-4"
            >
              <h2 id="programme-title" className="text-sm font-bold">
                Dans le programme
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {MEASURE_ATTRIBUTION_LABELS[measure.attribution]}
              </p>
              <p className="font-bold">{measure.programEdition.label}</p>
              <p className="text-sm text-muted-foreground">
                Document publié le {formatDate(measure.programEdition.publishedAt)}
              </p>
              <a
                href={measure.programEdition.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Consulter le programme ${measure.programEdition.label}, lien externe`}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Consulter le programme complet
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </a>
            </section>
          )}

          {measure.subtopics.length > 0 && (
            <section
              aria-labelledby="concepts-title"
              className="rounded-2xl border border-border bg-card p-4"
            >
              <h2 id="concepts-title" className="text-sm font-bold">
                Notions abordées
              </h2>
              <dl className="mt-2 space-y-3">
                {measure.subtopics.map((subtopic) => (
                  <div key={subtopic.slug}>
                    <dt>
                      <PresidentialSubtopicLink slug={subtopic.slug} label={subtopic.label} />
                    </dt>
                    <dd className="mt-1 text-sm leading-snug text-muted-foreground-strong">
                      {subtopic.description}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground-strong">
                Rattachement validé par la rédaction. Ces repères n&apos;évaluent ni le coût, ni la
                faisabilité de la mesure.
              </p>
            </section>
          )}
        </aside>

        <div className="lg:col-start-1">
          <section id="sources" aria-labelledby="sources-title" className="scroll-mt-24 py-6">
            <h2 id="sources-title" className="title-card font-display">
              Sources
            </h2>
            <ul className="mt-4 space-y-3">
              {measure.sources.map((source) => {
                const isVideo = isVideoSource(source.url, source.startAtSeconds);
                const timecode =
                  source.startAtSeconds == null ? null : formatTimecode(source.startAtSeconds);
                const kindLabel = MEASURE_SOURCE_KIND_LABELS[source.sourceKind];
                // Only YouTube opens at the passage. Elsewhere the link opens the page, so the label
                // must not promise a jump the player will not make.
                const jumpsToPassage = timecode !== null && isYouTubeUrl(source.url);
                const linkLabel = jumpsToPassage
                  ? "Voir le passage à " + timecode
                  : timecode
                    ? "Consulter la vidéo (passage à " + timecode + ")"
                    : "Consulter la source";
                return (
                  <li key={source.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      <span>{SOURCE_TIER_LABELS[source.tier]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{kindLabel}</span>
                      {isVideo && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-bold">
                          <PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />
                          Vidéo
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Publiée le {formatDate(source.publishedAt)}
                      {timecode
                        ? " · Passage à " + timecode
                        : source.page
                          ? " · " + source.page
                          : ""}
                    </p>
                    {source.excerpt ? (
                      <figure className="mt-4 rounded-xl border border-border bg-muted/60 p-4">
                        <figcaption className="text-muted-foreground-strong flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                          <Quote aria-hidden="true" className="text-brand-on-surface h-4 w-4" />
                          Dans le document source
                          {source.page
                            ? ", " + (/^\d/.test(source.page) ? "page " : "") + source.page
                            : ""}
                        </figcaption>
                        <blockquote
                          cite={source.url}
                          className="mt-3 max-w-[80ch] border-l-4 border-brand pl-4 text-[1.0625rem] leading-relaxed text-foreground"
                        >
                          <p>« {source.excerpt} »</p>
                        </blockquote>
                      </figure>
                    ) : null}
                    <a
                      href={videoSourceHref(source.url, source.startAtSeconds)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={
                        timecode
                          ? linkLabel + " : source externe, " + kindLabel
                          : "Consulter la source externe : " + kindLabel
                      }
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {linkLabel}
                      <ExternalLink aria-hidden="true" className="h-4 w-4" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          {measure.relatedMeasures.length > 0 && (
            <section aria-labelledby="related-title" className="py-6">
              {/* La comparaison porte sur tout le thème, pas sur cette mesure : elle se propose une
                  fois la mesure lue, à côté des mesures voisines qu'elle élargit. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 id="related-title" className="title-card font-display">
                  Ce que proposent d&apos;autres candidates et candidats
                </h2>
                <Link
                  href={comparisonUrl}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-4 text-sm font-bold text-primary hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
                >
                  Comparer les programmes sur {themeLabel.toLocaleLowerCase("fr")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {measure.relatedMeasures.map((related) => (
                  <li
                    key={related.slug}
                    className="flex h-full flex-col rounded-xl border border-border bg-card px-4 py-3"
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
                      <span className="mt-1 line-clamp-3 block leading-snug text-foreground group-hover:underline">
                        {related.text}
                      </span>
                    </Link>
                    {related.sharedSubtopics.length > 0 && (
                      <ul aria-label="Sous-thèmes partagés" className="mt-2 flex flex-wrap gap-2">
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
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground-strong">
                Mesures publiées sur {themeLabel.toLocaleLowerCase("fr")}
                {measure.relatedMeasures.some((related) => related.sharedSubtopics.length > 0)
                  ? ", rapprochées par sous-thème quand cette information a été validée."
                  : "."}{" "}
                Aucun classement ni jugement de faisabilité n&apos;est appliqué.
              </p>
            </section>
          )}

          {measure.details !== null && (
            <section aria-labelledby="details-title" className="py-6">
              <h2 id="details-title" className="title-card font-display">
                Contexte et précisions
              </h2>
              <MarkdownText className="mt-4 max-w-[80ch] leading-relaxed text-foreground">
                {measure.details}
              </MarkdownText>
              {measure.contextClaims.length > 0 ? (
                <details className="group mt-5 max-w-[80ch] rounded-xl border border-border bg-card">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 py-3 font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                    Vérifier les affirmations dans la source
                  </summary>
                  <ol className="space-y-4 border-t border-border px-4 py-4">
                    {measure.contextClaims.map((claim, claimIndex) => (
                      <li key={`${claim.text}-${claimIndex}`}>
                        <p className="text-sm leading-relaxed text-foreground">{claim.text}</p>
                        <ul className="mt-2 flex flex-wrap gap-3">
                          {claim.references
                            .filter(
                              (reference, index, references) =>
                                references.findIndex(
                                  (candidate) => candidate.page === reference.page
                                ) === index
                            )
                            .map((reference) => (
                              <li key={reference.page ?? "unknown-page"}>
                                <a
                                  href={claim.documentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Consulter l'extrait source${reference.page === null ? "" : `, page ${reference.page}`}, lien externe`}
                                  className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                >
                                  Extrait source
                                  {reference.page === null ? "" : `, page ${reference.page}`}
                                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                                </a>
                              </li>
                            ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : measure.sources.length > 0 ? (
                <Link
                  href="#sources"
                  className="mt-3 inline-flex min-h-11 items-center font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Voir les sources utilisées pour ce contexte
                </Link>
              ) : null}
            </section>
          )}

          {measure.readerGuides.length > 0 && (
            <section aria-labelledby="reader-guides-title" className="py-6">
              <h2 id="reader-guides-title" className="title-card font-display">
                Repères pour comprendre
              </h2>
              <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
                Des définitions factuelles pour comprendre les dispositifs cités, sans évaluer la
                mesure.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {measure.readerGuides.map((guide) => (
                  <article
                    key={guide.slug}
                    className="rounded-2xl border border-border bg-card p-5"
                  >
                    <h3 className="font-display text-lg font-bold">
                      <Link
                        href={presidentialReaderGuidePath(guide.slug)}
                        className="inline-flex min-h-11 items-center text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {guide.label}
                      </Link>
                    </h3>
                    <p className="mt-2 leading-relaxed text-foreground">{guide.definition}</p>
                    <a
                      href={guide.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Consulter la source ${guide.sourceLabel} publiée par ${guide.sourcePublisher}, lien externe`}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Source : {guide.sourcePublisher}, vérifiée le {formatDate(guide.reviewedAt)}
                      <ExternalLink aria-hidden="true" className="h-4 w-4" />
                    </a>
                  </article>
                ))}
              </div>
              <Link
                href={presidentialReaderGuidesPath()}
                className="mt-4 inline-flex min-h-11 items-center font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Consulter tous les repères de la présidentielle 2027
              </Link>
            </section>
          )}

          {measure.votes.length > 0 && (
            <section aria-labelledby="votes-title" className="py-6">
              <h2 id="votes-title" className="title-card font-display">
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

          <MeasureParliamentLinks
            links={measure.parliamentLinks}
            candidateName={measure.candidate.name}
          />

          <div className="py-6 empty:hidden">
            <ParliamentThemeBridgeLoader theme={measure.theme} source="mesure" />
          </div>

          <div className="py-6">
            <YoutubeBanner />
          </div>

          <footer className="border-t border-border py-8 text-sm text-muted-foreground">
            <p>
              Cette page décrit le contenu actuellement publié dans le corpus PoliGraph. Elle ne
              constitue ni une appréciation de la mesure, ni une synthèse de l{"'"}ensemble de la
              campagne.
            </p>
            <p className="mt-2">Dernière revue éditoriale : {formatDate(measure.reviewedAt)}</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
