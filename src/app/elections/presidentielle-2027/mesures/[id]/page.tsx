import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MeasurePrecisionBadge } from "@/components/measures/MeasurePrecisionBadge";
import { VoteRelationBadge } from "@/components/measures/VoteRelationBadge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import {
  CHAMBER_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { getPublicPresidentialMeasureDetail } from "@/lib/data/presidential-measure-detail";
import { themeToSlug } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";

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
  const canonical = "/elections/" + ELECTION_SLUG + "/mesures/" + measure.id;
  return {
    title: measure.text + " | Présidentielle 2027 | Poligraph",
    description:
      "Mesure publique portée par " +
      measure.candidate.name +
      " sur le thème " +
      THEME_CATEGORY_LABELS[measure.theme] +
      ".",
    alternates: { canonical },
  };
}

export default async function PresidentialMeasurePage({ params }: PageProps) {
  const { id } = await params;
  const measure = await getPublicPresidentialMeasureDetail(ELECTION_SLUG, id);
  if (measure === null) notFound();

  const canonical = "/elections/" + ELECTION_SLUG + "/mesures/" + measure.id;
  const themeUrl = "/elections/" + ELECTION_SLUG + "/themes/" + themeToSlug(measure.theme);
  const candidateUrl = "/elections/" + ELECTION_SLUG + "/candidats/" + measure.candidate.slug;

  return (
    <main className="pb-14">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: THEME_CATEGORY_LABELS[measure.theme], href: themeUrl },
          { label: "Mesure", href: canonical },
        ]}
      />
      <article className="container mx-auto max-w-4xl px-4">
        <header className="border-b border-border pb-8 pt-3">
          <p className="text-sm font-bold text-primary">
            Mesure publiée · {THEME_CATEGORY_LABELS[measure.theme]}
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {measure.text}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {measure.precision && <MeasurePrecisionBadge precision={measure.precision} />}
            <span className="text-sm text-muted-foreground">
              Dernière revue éditoriale le {formatDate(measure.reviewedAt)}
            </span>
          </div>
        </header>

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
            href={themeUrl}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Comparer les mesures sur {THEME_CATEGORY_LABELS[measure.theme]}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>

        <section aria-labelledby="sources-title" className="border-t border-border py-8">
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
