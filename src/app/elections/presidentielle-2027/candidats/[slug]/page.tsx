import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronDown, ExternalLink, UserRound } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ShareBar } from "@/components/ui/ShareBar";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { BreadcrumbJsonLd, PersonJsonLd } from "@/components/seo/JsonLd";
import { candidacyRoleLabel } from "@/config/labels";
import { isFicheCandidatPublishable } from "@/config/publication-gates";
import { SITE_URL } from "@/config/site";
import { cn } from "@/lib/utils";
// Reuses the established politician authority rather than adding a second, lighter read for three
// fields. It loads more than this page needs, but it is already cached under `politician:<slug>`.
import { getPolitician } from "@/lib/data/politicians";
import {
  getCandidateFicheDetail,
  getPoliticianPresidentialCandidacy,
} from "@/lib/data/politician-candidacy";
import { CandidacyStatusBadge } from "../../_components/CandidacyStatusBadge";
import { PartyLogo } from "../../_components/PartyLogo";
import { CandidacyBackBar } from "./_components/CandidacyBackBar";
import {
  CandidateTransparency,
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
 * One place for the fiche path. The canonical, the share link and the link the OG card is attached
 * to are the same URL, and a reader who copies the address bar must land on what they shared.
 */
function fichePath(slug: string): string {
  return `/elections/presidentielle-2027/candidats/${slug}`;
}

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

  const title = `${politician.fullName}, candidature à la présidentielle 2027 | Poligraph`;
  const description = `Les mesures documentées de ${politician.fullName} pour la présidentielle 2027, par thème, avec leurs sources.`;

  return {
    title,
    description,
    // A surface below its gate stays out of search results (spec §4.2). `follow: true` so the links
    // out of the page keep their value.
    robots: publishable ? undefined : { index: false, follow: true },
    alternates: { canonical: fichePath(slug) },
    // A pasted link must show the fiche, not the tab title a platform guesses from the document.
    // No `images` here: the `opengraph-image` route beside this file already provides the card, and
    // naming a second image would let the two drift. `summary_large_image` is what that 1200x630
    // card is drawn for, and X falls back to `og:image` since we ship no `twitter-image` route.
    openGraph: {
      title,
      description,
      type: "profile",
      url: fichePath(slug),
    },
    twitter: { card: "summary_large_image", title, description },
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
      {publishable && (
        <>
          <PersonJsonLd
            name={politician.fullName}
            givenName={politician.firstName}
            familyName={politician.lastName}
            affiliation={candidacy.partyLabel ?? undefined}
            image={politician.blobPhotoUrl ?? politician.photoUrl ?? undefined}
            url={`${SITE_URL}${fichePath(slug)}`}
          />
          <BreadcrumbJsonLd
            items={[
              { name: "Élections", url: `${SITE_URL}/elections` },
              {
                name: "Présidentielle 2027",
                url: `${SITE_URL}/elections/${candidacy.electionSlug}`,
              },
              { name: politician.fullName, url: `${SITE_URL}${fichePath(slug)}` },
            ]}
          />
        </>
      )}
      {/* Sharing a fiche is the same gesture as sharing any other Poligraph page, so it is the same
          bar, with the same platforms and the same copy control. It only appears above the
          publication gate: below it the page carries a sourced status and nothing else, stays
          `noindex` by policy, and handing readers buttons to spread a page we keep out of search
          would contradict that policy rather than serve them. */}
      {publishable && (
        <ShareBar
          data={{
            title: politician.fullName,
            // Name, election, party: the three facts that stay true. Deliberately no candidacy
            // status and no measure count, for the reason the OG card states at length. A post
            // outlives the day it was written, and a withdrawn candidacy shared as "annoncée"
            // cannot be corrected once it is out.
            text: `${politician.fullName}, ${candidacy.electionShortTitle}${candidacy.partyLabel ? ` (${candidacy.partyLabel})` : ""} : ses mesures et leurs sources sur Poligraph`,
            url: `${SITE_URL}${fichePath(slug)}`,
          }}
        />
      )}
      <CandidacyBackBar electionSlug={candidacy.electionSlug} />
      {/* The mobile share bar is fixed to the bottom of the viewport, so the last control of the
          page needs room to clear it. The extra padding goes away at `2xl`, where that bar becomes
          the vertical one on the left. */}
      <div
        className={cn(
          "container mx-auto space-y-8 px-4 pt-4",
          publishable ? "pb-24 2xl:pb-8" : "pb-8"
        )}
      >
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: "Présidentielle 2027", href: `/elections/${candidacy.electionSlug}` },
            { label: politician.fullName },
          ]}
        />

        <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_6rem]">
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
              <p className="text-base font-semibold text-foreground">{candidacy.partyLabel}</p>
            )}
          </div>
          {candidacy.partyLabel && (
            <PartyLogo
              logoUrl={candidacy.partyLogoUrl}
              label={candidacy.partyLabel}
              color={candidacy.partyColor}
              size="lg"
              className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end"
            />
          )}
        </header>

        {!publishable && (
          <section className="rounded-xl border border-dashed bg-muted/30 p-5 md:p-7">
            <h2 className="font-display text-xl font-bold">Contenu disponible sur Poligraph</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground-strong">
              {candidacy.programmeIdentified
                ? "Poligraph a repéré un programme. Son traitement éditorial est en cours."
                : "Poligraph n’a pas encore trouvé ou traité de programme pour cette candidature."}
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
              candidateSlug={slug}
              measureCount={candidacy.publishedMeasureCount}
              lastReviewedAt={candidacy.lastReviewedAt}
            />

            <CandidateStats
              measureCount={candidacy.publishedMeasureCount}
              themesCoveredCount={candidacy.themesCoveredCount}
              mandateCount={detail.mandateCount}
            />

            <CandidateThemeSpread themes={detail.themes} />

            <CandidateRecentVotes votes={detail.recentVotes} politicianSlug={slug} />

            <CandidateTransparency
              declarationCount={politician.declarations.length}
              probityConvictionCount={detail.probityConvictionCount}
              probityNonDefinitiveConvictionCount={detail.probityNonDefinitiveConvictionCount}
              politicianSlug={slug}
            />
          </>
        )}

        <details className="group rounded-xl border bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden md:px-6">
            <span className="font-display text-sm font-bold">
              Vérifier le statut de candidature
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {candidacy.sourceLabel}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="border-t border-border px-4 pb-4 pt-3 md:px-6 md:pb-5">
            <p className="text-sm leading-relaxed text-muted-foreground">{candidacy.sourceLabel}</p>
            <a
              href={candidacy.sourceUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              aria-label="Consulter l’annonce ou la source originale, lien externe"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline hover:no-underline"
            >
              Consulter l&apos;annonce ou la source originale
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </details>

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
