import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { PersonJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ProfileReturnLink } from "@/components/governments/ProfileReturnLink";
import { getPoliticianProfile } from "@/lib/data/politician-profile";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { PoliticianHeader } from "./_components/PoliticianHeader";
import { PoliticianProfileBody } from "./_components/PoliticianProfileBody";
import {
  buildPoliticianMetadata,
  derivePoliticianPageModel,
  loadPoliticianPage,
} from "./page-data";
import { ShareBar } from "@/components/ui/ShareBar";
import { DeepLinkHighlighter } from "@/components/politicians/DeepLinkHighlighter";
import { CandidacyNotice } from "@/components/politicians/CandidacyNotice";
import { isFicheCandidatPublishable } from "@/config/publication-gates";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

export async function generateStaticParams() {
  const politicians = await db.politician.findMany({
    select: { slug: true },
    orderBy: { prominenceScore: "desc" },
    take: 50,
  });
  return politicians.map((p) => ({ slug: p.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  // Same cache entry as the page: one document read serves both.
  const profile = await getPoliticianProfile(slug);

  if (!profile) {
    return missingEntityMetadata("Politicien non trouvé");
  }

  return buildPoliticianMetadata(profile.identity, slug);
}

export default async function PoliticianPage({ params }: PageProps) {
  const { slug } = await params;
  // One precomputed document holds the identity, the tab bodies and the vote stats together, so
  // there is no split read left that could find the identity but not the dossier: a missing or
  // non-public person is a 404, never a profile served with an empty dossier.
  const data = await loadPoliticianPage(slug);

  if (!data) {
    notFound();
  }

  // `presidentialCandidacy` is null unless this person carries a SOURCED presidential candidacy,
  // which is what makes the notice sayable: there is no "we are not sure" state, the block simply
  // does not appear.
  const { profile, presidentialCandidacy } = data;
  const politician = profile.identity;
  const model = derivePoliticianPageModel(politician, profile.dossier, profile.voteStats);

  const now = new Date();
  // Null only when there is no sourced candidacy, which is the one case the fiche route sends back
  // here. A sourced candidacy without a published programme has a fiche of its own, so the notice
  // points at it and keeps its possessive wording.
  const ficheHref =
    presidentialCandidacy !== null && isFicheCandidatPublishable({ statusSourced: true })
      ? `/elections/${presidentialCandidacy.electionSlug}/candidats/${politician.slug}`
      : null;

  return (
    <>
      <ShareBar data={model.share} />
      {/* JSON-LD Structured Data */}
      <PersonJsonLd {...model.personJsonLd} />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <DeepLinkHighlighter />
        <Breadcrumb
          items={[{ label: "Politiques", href: "/politiques" }, { label: politician.fullName }]}
        />
        <ProfileReturnLink slug={politician.slug} />

        {/* Header */}
        <PoliticianHeader politician={politician} currentGroup={model.currentGroup} />

        {/* Full width, under the badges, above the tabs, at both widths. Never a badge in the
            party/mandate row: there it would read as a qualification awarded by Poligraph. */}
        {presidentialCandidacy && (
          <div className="mb-8">
            <CandidacyNotice
              candidacy={presidentialCandidacy}
              civility={politician.civility}
              now={now}
              ficheHref={ficheHref}
            />
          </div>
        )}

        {/* The tab bodies render from the document already in hand: nothing left to stream. */}
        <PoliticianProfileBody {...model.body} />

        <aside className="mt-12 p-4 rounded-lg border bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Comparez {politician.firstName} {politician.lastName} avec les autres représentants dans{" "}
            <Link
              href={model.stats.url}
              aria-label={model.stats.aria}
              className="text-primary hover:underline"
              prefetch={false}
            >
              {model.stats.label}
            </Link>
            .
          </p>
        </aside>
      </div>
    </>
  );
}
