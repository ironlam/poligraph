import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, UserRound } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { candidacyRoleLabel } from "@/config/labels";
import { isFicheCandidatPublishable } from "@/config/publication-gates";
// Reuses the established politician authority rather than adding a second, lighter read for three
// fields. It loads more than this page needs, but it is already cached under `politician:<slug>`.
import { getPolitician } from "@/lib/data/politicians";
import {
  getCandidateFicheDetail,
  getPoliticianPresidentialCandidacy,
} from "@/lib/data/politician-candidacy";
import { CandidacyStatusBadge } from "../../_components/CandidacyStatusBadge";
import { CandidacyBackBar } from "./_components/CandidacyBackBar";
import {
  CandidateIntegrity,
  CandidateRecentVotes,
  CandidateStats,
  CandidateSynthesis,
  CandidateThemeSpread,
  CandidateThemes,
} from "./_components/CandidateFicheBlocks";

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

  if (!candidacy) {
    redirect(`/politiques/${slug}`);
  }

  const detail = publishable
    ? await getCandidateFicheDetail(candidacy.candidacyId, politician.id)
    : null;

  return (
    <>
      <CandidacyBackBar electionSlug={candidacy.electionSlug} />
      <div className="container mx-auto space-y-8 px-4 pb-8 pt-4">
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: "Présidentielle 2027", href: `/elections/${candidacy.electionSlug}` },
            { label: politician.fullName },
          ]}
        />

        <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div aria-hidden="true">
            <PoliticianAvatar
              photoUrl={politician.photoUrl ?? null}
              blobPhotoUrl={politician.blobPhotoUrl ?? null}
              fullName={politician.fullName}
              size="lg"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-brand">
              {candidacy.electionShortTitle}
            </p>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {politician.fullName}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{candidacyRoleLabel(politician.civility)}</span>
              {/* The same badge language as the field, so a reader arriving from the list sees the
                pastille they clicked, unchanged. Not a link here: the source is a full line just
                below, and two controls to the same URL name one destination twice. */}
              <CandidacyStatusBadge status={candidacy.status} />
            </p>
            {candidacy.partyLabel && (
              <p className="text-sm text-muted-foreground-strong">{candidacy.partyLabel}</p>
            )}
          </div>
        </header>

        <section className="space-y-2 rounded-xl border bg-card p-4 md:p-6">
          <h2 className="font-display text-base font-bold">Source du statut de candidature</h2>
          <p className="text-sm text-muted-foreground">{candidacy.sourceLabel}</p>
          <a
            href={candidacy.sourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            aria-label="Consulter l’annonce ou la source originale, lien externe"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline hover:no-underline"
          >
            Consulter l&apos;annonce ou la source originale
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </section>

        {!publishable && (
          <section className="rounded-xl border border-dashed bg-muted/30 p-5 md:p-7">
            <h2 className="font-display text-xl font-bold">Contenu disponible sur Poligraph</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground-strong">
              {candidacy.programmeIdentified
                ? "Programme identifié, aucune proposition encore publiée sur Poligraph."
                : "Poligraph n’a identifié aucun programme publié à ce jour."}
            </p>
          </section>
        )}

        {publishable && detail && (
          <>
            <CandidateSynthesis
              synthesis={candidacy.synthesis}
              generatedAt={candidacy.synthesisGeneratedAt}
              measureCount={candidacy.publishedMeasureCount}
            />

            {/* Measures before the counters, everywhere and not only on mobile.
            The three counters describe the COVERAGE of our own work; they are a caption on the
            measures, not an introduction to them. Reading them first meant scrolling past a
            description of the content to reach the content, which on a phone is the whole first
            screen. One order for every width rather than two: a block that belongs after on a
            phone does not belong before on a desktop, it was simply less costly there. */}
            <CandidateThemes
              themes={detail.themes}
              electionSlug={candidacy.electionSlug}
              lastReviewedAt={candidacy.lastReviewedAt}
            />

            <CandidateStats
              measureCount={candidacy.publishedMeasureCount}
              themesCoveredCount={candidacy.themesCoveredCount}
              mandateCount={detail.mandateCount}
            />

            <CandidateThemeSpread themes={detail.themes} />

            <CandidateRecentVotes votes={detail.recentVotes} politicianSlug={slug} />

            <CandidateIntegrity
              declarationCount={politician.declarations.length}
              affairCount={politician.affairs.length}
              politicianSlug={slug}
            />
          </>
        )}

        <section className="space-y-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground md:p-6">
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">
            D&apos;où viennent ces données
          </h2>
          <p>
            Chaque mesure est extraite d&apos;un document daté, relue, et publiée avec sa source. Le
            statut de la candidature vient de la source citée ci-dessus, à sa date. Aucun
            classement, aucun score de proximité : l&apos;ordre des candidatures est alphabétique
            partout sur le site.
          </p>
          {/* Named rather than hidden: a reader who sees the gap stated can tell "not built yet"
              from "nothing to say". Neither block has a date, and promising one would be worse. */}
          <p>
            Deux volets manquent encore. Le rapprochement entre chaque mesure et les scrutins
            portant sur le même objet, qui demande un rattachement que la base ne porte pas encore.
            Et le bilan des fonctions exercées, objectifs annoncés face aux chiffres constatés, qui
            demande un suivi post-électoral à construire.
          </p>
        </section>

        {/* The one filled-weight control of the page, and it is an outline: the fiche is about the
            candidacy, so what lies outside it gets a single named exit rather than a navy block
            competing with the measures. The way back to the field is no longer repeated here, it
            is in the bar that stays on screen throughout. */}
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground-strong">
            Aller plus loin
          </h2>
          <p className="mt-2 text-sm text-muted-foreground-strong">
            Mandats, votes, patrimoine et procédures : hors périmètre de la candidature.
          </p>
          <Link
            href={`/politiques/${slug}`}
            prefetch={false}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-border px-4 font-display text-sm font-bold text-primary hover:border-primary hover:bg-muted md:min-h-[40px]"
          >
            <UserRound aria-hidden="true" className="h-4 w-4 shrink-0" />
            Mandats, votes et parcours politique
          </Link>
        </section>
      </div>
    </>
  );
}
