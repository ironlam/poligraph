import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { formatCompactCurrency } from "@/lib/utils";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { statsHref, DEFAULT_STATS_TAB } from "@/config/routes";
import { PersonJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeclarationDetails } from "@/types/hatvp";
import { getPoliticianIdentity } from "@/lib/data/politicians";
import { politicianRobotsMetadata } from "@/lib/seo/politician-robots";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { PoliticianHeader } from "./_components/PoliticianHeader";
import { PoliticianProfileBody } from "./_components/PoliticianProfileBody";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { DeepLinkHighlighter } from "@/components/politicians/DeepLinkHighlighter";
import { CandidacyNotice } from "@/components/politicians/CandidacyNotice";
import { getPoliticianPresidentialCandidacy } from "@/lib/data/politician-candidacy";
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
  const politician = await getPoliticianIdentity(slug);

  if (!politician) {
    return missingEntityMetadata("Politicien non trouvé");
  }

  const currentMandate = politician.mandates.find((m) => m.isCurrent);
  const role = currentMandate
    ? `${currentMandate.type === "DEPUTE" ? "Député" : currentMandate.type === "SENATEUR" ? "Sénateur" : "Représentant"}`
    : "Représentant politique";

  // Find latest DIA declaration with details for SEO
  const latestDIA = politician.declarations.find((d) => d.type === "INTERETS" && d.details);
  const details = latestDIA?.details as DeclarationDetails | null;

  let hatvpDescription = "";
  if (details) {
    const parts: string[] = [];
    if (details.totalPortfolioValue && details.totalPortfolioValue > 0) {
      parts.push(
        `${formatCompactCurrency(details.totalPortfolioValue)} de participations financières déclarées`
      );
    }
    if (details.totalCompanies > 0) {
      parts.push(`${details.totalCompanies} sociétés déclarées`);
    }
    if (parts.length > 0) {
      hatvpDescription = ` ${parts.join(", ")}.`;
    }
  }

  const description = `${role} ${politician.currentParty ? `(${politician.currentParty.shortName})` : ""} - Consultez ses mandats, déclarations d'intérêts et affaires judiciaires.${hatvpDescription}`;

  // Bare profiles (RNE-imported mayors with no content) get noindex,follow (issue #385).
  // The two counters come from the identity read's filtered `_count`, under the same public
  // predicates the dossier read applies when it lists those same rows.
  const robots = politicianRobotsMetadata({
    mandates: politician.mandates.map((m) => ({
      type: m.type,
      communePopulation: m.localData?.commune?.population ?? null,
    })),
    publishedAffairsCount: politician._count.affairs,
    factCheckMentionsCount: politician._count.factCheckMentions,
    declarationsCount: politician.declarations.length,
    biography: politician.biography,
  });

  return {
    title: politician.fullName,
    description,
    ...robots,
    alternates: { canonical: `/politiques/${slug}` },
    openGraph: {
      title: `${politician.fullName} | Poligraph`,
      description,
      type: "profile",
      images: politician.photoUrl
        ? [
            {
              url: politician.photoUrl,
              width: 200,
              height: 200,
              alt: politician.fullName,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary",
      title: politician.fullName,
      description,
      images: politician.photoUrl ? [politician.photoUrl] : undefined,
    },
  };
}

/**
 * Shown while the tab bodies resolve. Deliberately the shape of the real thing (a tab strip over a
 * card) rather than a spinner: this boundary streams in after a header that is already on screen,
 * so a placeholder that jumps to a different height is worse than one that does not.
 */
function ProfileBodySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-4 border-b pb-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="hidden lg:block">
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default async function PoliticianPage({ params }: PageProps) {
  const { slug } = await params;
  const politician = await getPoliticianIdentity(slug);

  if (!politician) {
    notFound();
  }

  // Returns null unless this person carries a SOURCED presidential candidacy, which is what makes
  // the notice sayable: there is no "we are not sure" state, the block simply does not appear.
  const presidentialCandidacy = await getPoliticianPresidentialCandidacy(politician.id);
  const now = new Date();
  // Null only when there is no sourced candidacy, which is the one case the fiche route sends back
  // here. A sourced candidacy without a published programme has a fiche of its own, so the notice
  // points at it and keeps its possessive wording.
  const ficheHref =
    presidentialCandidacy !== null && isFicheCandidatPublishable({ statusSourced: true })
      ? `/elections/${presidentialCandidacy.electionSlug}/candidats/${politician.slug}`
      : null;

  const currentMandate = politician.mandates.find((m) => m.isCurrent);
  // Mandates arrive sorted by startDate desc, so the headline mandate of a sitting
  // parliamentarian who also holds a local one is the local mandate. The votes tab, the card,
  // the group badge and the comparison link read this one instead, or they serve an empty votes
  // tab to 42 people. The header, the metadata and the JSON-LD still headline `currentMandate`.
  const currentParliamentaryMandate = politician.mandates.find(
    (m) => m.isCurrent && (m.type === "DEPUTE" || m.type === "SENATEUR")
  );
  const currentGroup = (
    currentParliamentaryMandate as typeof currentParliamentaryMandate & {
      parliamentaryData?: {
        parliamentaryGroup?: { code: string; name: string; color: string | null } | null;
      } | null;
    }
  )?.parliamentaryData?.parliamentaryGroup;
  const isActiveParliamentarian = currentParliamentaryMandate !== undefined;
  const isChamberPresident = politician.mandates.some(
    (m) => m.isCurrent && m.role != null && /^Président /.test(m.role)
  );

  // Get vote stats (for deputies and senators - both have votes tracked)
  const mandateType =
    currentParliamentaryMandate?.type === "DEPUTE" ||
    currentParliamentaryMandate?.type === "SENATEUR"
      ? currentParliamentaryMandate.type
      : null;

  // Extract companies where politician is a board member for JSON-LD
  const latestDIAForLD = politician.declarations.find((d) => d.type === "INTERETS" && d.details);
  const detailsForLD = latestDIAForLD?.details as DeclarationDetails | null;
  const memberOfOrgs =
    detailsForLD?.financialParticipations
      .filter((p) => p.isBoardMember)
      .map((p) => ({ name: p.company }))
      .slice(0, 10) ?? [];

  return (
    <>
      <ShareBar
        data={{
          title: politician.fullName,
          text: `${politician.fullName}${currentMandate ? `, ${MANDATE_TYPE_LABELS[currentMandate.type]}` : ""}${politician.currentParty ? ` (${politician.currentParty.shortName})` : ""}`,
          url: `${SITE_URL}/politiques/${politician.slug}`,
        }}
      />
      {/* JSON-LD Structured Data */}
      <PersonJsonLd
        name={politician.fullName}
        givenName={politician.firstName}
        familyName={politician.lastName}
        jobTitle={currentMandate ? MANDATE_TYPE_LABELS[currentMandate.type] : undefined}
        affiliation={politician.currentParty?.name}
        image={politician.photoUrl || undefined}
        birthDate={politician.birthDate?.toISOString().split("T")[0]}
        deathDate={politician.deathDate?.toISOString().split("T")[0]}
        birthPlace={politician.birthPlace || undefined}
        url={`${SITE_URL}/politiques/${politician.slug}`}
        sameAs={politician.externalIds
          .map((e) => e.url)
          .filter((url): url is string => url != null)}
        memberOf={memberOfOrgs.length > 0 ? memberOfOrgs : undefined}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <DeepLinkHighlighter />
        <Breadcrumb
          items={[{ label: "Politiques", href: "/politiques" }, { label: politician.fullName }]}
        />

        {/* Header */}
        <PoliticianHeader politician={politician} currentGroup={currentGroup} />

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

        {/* Everything below this line reads the affairs, fact-checks, party history and authored
            dossiers. None of it is above the fold, and all of it used to sit on the critical path
            of the header and the metadata. */}
        <Suspense fallback={<ProfileBodySkeleton />}>
          <PoliticianProfileBody
            politician={politician}
            mandateType={mandateType}
            currentParliamentaryMandate={
              currentParliamentaryMandate && mandateType
                ? {
                    type: mandateType,
                    title: currentParliamentaryMandate.title,
                    constituency: currentParliamentaryMandate.constituency,
                  }
                : null
            }
            currentGroup={currentGroup ?? null}
            isActiveParliamentarian={isActiveParliamentarian}
            isChamberPresident={isChamberPresident}
          />
        </Suspense>

        {(() => {
          const isDepute = currentParliamentaryMandate?.type === "DEPUTE";
          const isSenateur = currentParliamentaryMandate?.type === "SENATEUR";
          const statsUrl = isDepute
            ? statsHref("participation", { chamber: "AN" })
            : isSenateur
              ? statsHref("participation", { chamber: "SENAT" })
              : statsHref(DEFAULT_STATS_TAB);
          const statsLabel = isDepute
            ? "les statistiques de l'Assemblée nationale"
            : isSenateur
              ? "les statistiques du Sénat"
              : "les statistiques générales";
          const statsAria = `Voir ${statsLabel} pour comparer ${politician.firstName} ${politician.lastName}`;
          return (
            <aside className="mt-12 p-4 rounded-lg border bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Comparez {politician.firstName} {politician.lastName} avec les autres représentants
                dans{" "}
                <Link
                  href={statsUrl}
                  aria-label={statsAria}
                  className="text-primary hover:underline"
                  prefetch={false}
                >
                  {statsLabel}
                </Link>
                .
              </p>
            </aside>
          );
        })()}
      </div>
    </>
  );
}
