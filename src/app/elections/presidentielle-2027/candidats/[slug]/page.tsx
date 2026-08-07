import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CANDIDACY_STATUS_LABELS, candidacyRoleLabel } from "@/config/labels";
import { isFicheCandidatPublishable } from "@/config/publication-gates";
// Reuses the established politician authority rather than adding a second, lighter read for three
// fields. It loads more than this page needs, but it is already cached under `politician:<slug>`.
import { getPolitician } from "@/lib/data/politicians";
import { getPoliticianPresidentialCandidacy } from "@/lib/data/politician-candidacy";
import { formatDate } from "@/lib/utils";

/**
 * Candidate fiche for the presidential hub. `[slug]` is the POLITICIAN slug, consistent with
 * `politicianSlug` everywhere in the hub data layer and with the link the notice emits.
 *
 * Below the publication gate the route redirects to `/politiques/[slug]`, which is what spec §4.1 of
 * the hub design prescribes ("no fiche, the name points to /politiques/[slug]"). A redirect leaves no
 * orphan page to maintain and no URL to de-index later.
 *
 * Above the gate it renders a MINIMAL fiche: identity, sourced status, measure volume linking to the
 * subject pages, provenance. The full #D3 screen of the handoff is a separate lot and grows on top of
 * this one.
 */

export const revalidate = 86400;

/**
 * No pre-generation. The publishable population changes with EDITORIAL WRITES, not with deployments:
 * pre-generating at build time would freeze a list that a publication invalidates hours later, and
 * would make a fiche's going live depend on a redeploy. Fiches are therefore generated on demand
 * under ISR, and this reasoning survives the first publication.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Plural agreement: the gate opens at one measure, so "1 mesures" is reachable. */
function plural(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? "s" : ""}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const politician = await getPolitician(slug);
  if (!politician) return { robots: { index: false, follow: true } };

  const candidacy = await getPoliticianPresidentialCandidacy(politician.id);
  const publishable =
    candidacy !== null &&
    isFicheCandidatPublishable({
      statusSourced: true,
      verifiedMeasuresWithPrimarySource: candidacy.primarySourceMeasureCount,
    });

  return {
    title: `${politician.fullName}, candidature à la présidentielle 2027 | Poligraph`,
    description: `Les mesures documentées de ${politician.fullName} pour la présidentielle 2027, par sujet, avec leurs sources.`,
    // A surface below its gate stays out of search results (spec §4.2). `follow: true` so the links
    // out of the page keep their value.
    robots: publishable ? undefined : { index: false, follow: true },
    alternates: { canonical: `/elections/presidentielle-2027/candidats/${slug}` },
  };
}

export default async function CandidateFichePage({ params }: PageProps) {
  const { slug } = await params;
  const politician = await getPolitician(slug);
  if (!politician) notFound();

  const candidacy = await getPoliticianPresidentialCandidacy(politician.id);
  const publishable =
    candidacy !== null &&
    isFicheCandidatPublishable({
      statusSourced: true,
      verifiedMeasuresWithPrimarySource: candidacy.primarySourceMeasureCount,
    });

  if (!candidacy || !publishable) {
    redirect(`/politiques/${slug}`);
  }

  return (
    <div className="container mx-auto space-y-8 px-4 pb-8 pt-4">
      <Breadcrumb
        items={[
          { label: "Présidentielle", href: `/elections/${candidacy.electionSlug}` },
          { label: politician.fullName },
        ]}
      />

      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">
          {candidacy.electionShortTitle}
        </p>
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          {politician.fullName}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{candidacyRoleLabel(politician.civility)}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {CANDIDACY_STATUS_LABELS[candidacy.status]}
          </span>
          <a
            href={candidacy.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs underline hover:no-underline"
          >
            {candidacy.sourceLabel}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </p>
      </header>

      <section className="space-y-3 rounded-xl border bg-card p-4 md:p-6">
        <h2 className="font-display text-xl font-bold tracking-tight">Son programme par sujet</h2>
        <p className="text-sm text-muted-foreground">
          {plural(candidacy.publishedMeasureCount, "mesure")} publiée
          {candidacy.publishedMeasureCount > 1 ? "s" : ""} sur{" "}
          {plural(candidacy.themesCoveredCount, "sujet")}
          {candidacy.lastReviewedAt && (
            <> · dernière revue le {formatDate(candidacy.lastReviewedAt)}</>
          )}
          .
        </p>
        <p className="text-sm">
          <Link
            href={`/elections/${candidacy.electionSlug}/sujets`}
            prefetch={false}
            className="font-bold text-primary hover:underline"
          >
            Parcourir les sujets
          </Link>
        </p>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground md:p-6">
        <h2 className="font-display text-base font-bold tracking-tight text-foreground">
          D&apos;où viennent ces données
        </h2>
        <p>
          Chaque mesure est extraite d&apos;un document daté, relue, et publiée avec sa source. Le
          statut de la candidature vient de la source citée ci-dessus, à sa date. Aucun classement,
          aucun score de proximité : l&apos;ordre des candidatures est alphabétique partout sur le
          site.
        </p>
      </section>
    </div>
  );
}
