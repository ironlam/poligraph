import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate, formatCompactCurrency } from "@/lib/utils";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { statsHref, DEFAULT_STATS_TAB } from "@/config/routes";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";
import { PersonJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { DeclarationCard } from "@/components/declarations/DeclarationCard";
import { MarkdownText } from "@/components/ui/markdown";
import type { DeclarationDetails } from "@/types/hatvp";
import { FileText } from "lucide-react";
import { StatusBadge } from "@/components/legislation";
import { BetaDisclaimer } from "@/components/BetaDisclaimer";
import { ProfileTabs } from "@/components/politicians/ProfileTabs";
import { FactChecksTab } from "@/components/politicians/FactChecksTab";
import { CareerTimeline } from "@/components/politicians/CareerTimeline";
import { AffairsSection } from "@/components/politicians/AffairsSection";
import { VotesSection } from "@/components/politicians/VotesSection";
import {
  getPoliticianVotingStats,
  getPoliticianParliamentaryCard,
  voteStatsService,
} from "@/services/voteStats";
import { getPolitician } from "@/lib/data/politicians";
import { politicianRobotsMetadata } from "@/lib/seo/politician-robots";
import { PoliticianHeader } from "./_components/PoliticianHeader";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { computeJudicialCounts } from "@/lib/politicians/judicial-counts";
import { buildPoliticianSignals } from "@/lib/politicians/signals";
import { buildSourceLinks } from "@/lib/politicians/external-sources";
import { PoliticianSignals } from "@/components/politicians/PoliticianSignals";
import { PresumptionNotice } from "@/components/politicians/PresumptionNotice";
import { PoliticianSummary } from "@/components/politicians/PoliticianSummary";
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

async function getVoteStats(politicianId: string) {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const [stats, recentVotes, themeDistribution] = await Promise.all([
    getPoliticianVotingStats(politicianId),
    db.vote.findMany({
      where: { politicianId },
      include: {
        scrutin: {
          select: {
            id: true,
            // Slug drives the link: /parlement/votes/<cuid> only 308s to the
            // slug URL, so linking by id made every "Derniers votes" row an
            // internal redirect hop for crawlers.
            slug: true,
            title: true,
            votingDate: true,
            result: true,
            // Plan 6: public policy title (shown only when APPROVED + valid).
            policyTitle: {
              select: {
                status: true,
                policyTitle: true,
                policySubtitle: true,
                officialSourceUrl: true,
                proceduralLabel: true,
              },
            },
          },
        },
      },
      orderBy: { votingDate: "desc" },
      take: 5,
    }),
    voteStatsService.getPoliticianThemeDistribution(politicianId),
  ]);

  return { stats, recentVotes, themeDistribution };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const politician = await getPolitician(slug);

  if (!politician) {
    return { title: "Politicien non trouvé" };
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
  const robots = politicianRobotsMetadata({
    mandates: politician.mandates.map((m) => ({
      type: m.type,
      communePopulation: m.localData?.commune?.population ?? null,
    })),
    publishedAffairsCount: politician.affairs.length,
    factCheckMentionsCount: politician.factCheckMentions.length,
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

export default async function PoliticianPage({ params }: PageProps) {
  const { slug } = await params;
  const politician = await getPolitician(slug);

  if (!politician) {
    notFound();
  }

  // Returns null unless this person carries a SOURCED presidential candidacy, which is what makes
  // the notice sayable: there is no "we are not sure" state, the block simply does not appear.
  const presidentialCandidacy = await getPoliticianPresidentialCandidacy(politician.id);
  const now = new Date();
  // Null below the gate, where the fiche route redirects back here: the notice then points at the
  // hub and drops its possessive wording rather than promising a page that bounces.
  const ficheHref =
    presidentialCandidacy !== null &&
    isFicheCandidatPublishable({
      statusSourced: true,
      verifiedMeasuresWithPrimarySource: presidentialCandidacy.primarySourceMeasureCount,
    })
      ? `/elections/${presidentialCandidacy.electionSlug}/candidats/${politician.slug}`
      : null;

  const currentMandate = politician.mandates.find((m) => m.isCurrent);
  const currentGroup = (
    currentMandate as typeof currentMandate & {
      parliamentaryData?: {
        parliamentaryGroup?: { code: string; name: string; color: string | null } | null;
      } | null;
    }
  )?.parliamentaryData?.parliamentaryGroup;
  const isActiveParliamentarian = politician.mandates.some(
    (m) => m.isCurrent && (m.type === "DEPUTE" || m.type === "SENATEUR")
  );
  const isChamberPresident = politician.mandates.some(
    (m) => m.isCurrent && m.role != null && /^Président /.test(m.role)
  );

  // Get vote stats (for deputies and senators - both have votes tracked)
  const isParliamentarian =
    currentMandate?.type === "DEPUTE" || currentMandate?.type === "SENATEUR";
  const mandateType = currentMandate?.type as "DEPUTE" | "SENATEUR" | undefined;
  const [voteData, parliamentaryCard] = await Promise.all([
    isParliamentarian ? getVoteStats(politician.id) : null,
    isParliamentarian && mandateType
      ? getPoliticianParliamentaryCard(politician.id, mandateType)
      : null,
  ]);

  // directAffairs still feeds the Carrière timeline.
  const directAffairs = politician.affairs.filter((a) => a.involvement === "DIRECT");

  // Judicial counters: "mis en cause" = DIRECT only (no double count with
  // mentions; enquêtes préliminaires excluded, RGPD art. 10 invariant).
  const judicial = computeJudicialCounts(
    politician.affairs.map((a) => ({ involvement: a.involvement, status: a.status }))
  );

  // Extract companies where politician is a board member for JSON-LD
  const latestDIAForLD = politician.declarations.find((d) => d.type === "INTERETS" && d.details);
  const detailsForLD = latestDIAForLD?.details as DeclarationDetails | null;
  const memberOfOrgs =
    detailsForLD?.financialParticipations
      .filter((p) => p.isBoardMember)
      .map((p) => ({ name: p.company }))
      .slice(0, 10) ?? [];

  // Dashboard signals + verification sources (single source of truth, passed
  // to both PoliticianSignals and the two responsive PoliticianSummary mounts).
  const portfolioValue = detailsForLD?.totalPortfolioValue ?? null;
  const signals = buildPoliticianSignals({
    slug: politician.slug,
    mandatesCount: politician.mandates.length,
    votesTotal: voteData ? voteData.stats.total : null,
    hasVotesTab: Boolean((voteData && voteData.stats.total > 0) || parliamentaryCard),
    hasFactchecksTab: politician.factCheckMentions.length > 0,
    factchecksCount: politician.factCheckMentions.length,
    dossiersCount: politician.dossierAuthors.length,
    declarationsCount: politician.declarations.length,
    portfolioValue,
    patrimoineHref: `/politiques/${politician.slug}?tab=patrimoine`,
    judicial,
  });
  const sourceLinks = buildSourceLinks(
    politician.externalIds.map((e) => ({ source: e.source, url: e.url }))
  );
  const osEntry = politician.externalIds.find((e) => e.source === "OPENSANCTIONS");
  const osMeta = (osEntry?.metadata ?? null) as { datasets?: string[] } | null;
  const registres = [
    ...new Set(
      (osMeta?.datasets ?? [])
        .map((d) => OS_DATASET_LABELS[d])
        .filter((l): l is string => l != null)
    ),
  ];
  const lastUpdated = formatDate(politician.updatedAt);
  const relationsHref = `/politiques/${politician.slug}/relations`;

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

        {/* Summary before the tabbed body on mobile (DOM order matches reading order). */}
        <div className="lg:hidden mb-8">
          <PoliticianSummary
            signals={signals}
            sources={sourceLinks}
            registres={registres}
            relationsHref={relationsHref}
            lastUpdated={lastUpdated}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            <ProfileTabs
              affairsCount={judicial.badgeCount}
              profileContent={
                <div className="space-y-8">
                  {/* Dashboard: clickable signals + computed presumption note */}
                  <PoliticianSignals signals={signals} />
                  <PresumptionNotice
                    proceduresEnCours={judicial.proceduresEnCours}
                    condamnationsNonDefinitives={judicial.condamnationsNonDefinitives}
                  />

                  {/* Biography */}
                  {politician.biography && (
                    <Card id="biographie">
                      <CardContent className="pt-6">
                        <MarkdownText className="text-muted-foreground leading-relaxed">
                          {politician.biography}
                        </MarkdownText>
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed text-xs text-muted-foreground">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-3.5 h-3.5 shrink-0 text-primary/50"
                            aria-hidden="true"
                          >
                            <path d="M8 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 1ZM10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM12.95 4.11a.75.75 0 1 0-1.06-1.06l-1.062 1.06a.75.75 0 0 0 1.061 1.062l1.06-1.062ZM15 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 15 8ZM11.889 12.95a.75.75 0 0 0 1.06-1.06l-1.06-1.062a.75.75 0 0 0-1.062 1.061l1.062 1.06ZM8 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 12ZM5.172 11.889a.75.75 0 0 0-1.061-1.062L3.05 11.89a.75.75 0 1 0 1.06 1.06l1.062-1.06ZM4 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 4 8ZM4.11 5.172A.75.75 0 0 0 5.173 4.11L4.11 3.05a.75.75 0 1 0-1.06 1.06l1.06 1.062Z" />
                          </svg>
                          <span>
                            Résumé généré automatiquement à partir de sources publiques
                            {politician.biographyGeneratedAt &&
                              ` — ${formatDate(politician.biographyGeneratedAt)}`}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Authored Dossiers */}
                  {politician.dossierAuthors.length > 0 && (
                    <Card id="dossiers">
                      <CardHeader>
                        <h2 className="leading-none font-semibold flex items-center gap-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          Propositions de loi ({politician.dossierAuthors.length})
                        </h2>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {politician.dossierAuthors.map((da) => (
                            <Link
                              key={da.dossier.slug}
                              href={`/parlement/dossiers/${da.dossier.slug}`}
                              prefetch={false}
                              className="flex items-start justify-between gap-3 py-2 border-b last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-snug">
                                  {da.dossier.shortTitle || da.dossier.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  {da.dossier.number && (
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {da.dossier.number}
                                    </span>
                                  )}
                                  {da.dossier.filingDate && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatDate(da.dossier.filingDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <StatusBadge status={da.dossier.status} />
                            </Link>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              }
              factchecksContent={
                politician.factCheckMentions.length > 0 ? (
                  <FactChecksTab
                    mentions={politician.factCheckMentions}
                    politicianSlug={politician.slug}
                  />
                ) : null
              }
              careerContent={
                <div className="space-y-8">
                  <CareerTimeline
                    mandates={politician.mandates}
                    partyHistory={politician.partyHistory}
                    affairs={directAffairs}
                    birthDate={politician.birthDate}
                    deathDate={politician.deathDate}
                  />
                  {politician.mandates.length > 0 && (
                    <Card>
                      <CardHeader>
                        <h2 className="leading-none font-semibold">Mandats</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          Liste des mandats nationaux et européens connus. Les mandats locaux
                          (maire, conseiller, etc.) peuvent ne pas être listés.
                        </p>
                      </CardHeader>
                      <CardContent>
                        <MandateTimeline
                          mandates={politician.mandates}
                          civility={politician.civility}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              }
              votesContent={
                (voteData && voteData.stats.total > 0) || parliamentaryCard ? (
                  <VotesSection
                    slug={politician.slug}
                    voteData={voteData!}
                    parliamentaryCard={parliamentaryCard}
                    currentMandate={
                      currentMandate
                        ? {
                            type: currentMandate.type,
                            title: currentMandate.title,
                            constituency: currentMandate.constituency,
                          }
                        : null
                    }
                    currentGroup={currentGroup ?? null}
                    isChamberPresident={isChamberPresident}
                    themeDistribution={voteData?.themeDistribution}
                  />
                ) : null
              }
              patrimoineContent={
                politician.declarations.length > 0 ? (
                  <DeclarationCard
                    id="declarations"
                    declarations={politician.declarations.map((d) => ({
                      id: d.id,
                      type: d.type,
                      year: d.year,
                      hatvpUrl: d.hatvpUrl,
                      pdfUrl: d.pdfUrl,
                      details: d.details as DeclarationDetails | null,
                    }))}
                  />
                ) : isActiveParliamentarian ? (
                  <Card id="declarations">
                    <CardHeader>
                      <h2 className="text-lg font-semibold">
                        Déclarations d&apos;intérêts et d&apos;activités
                      </h2>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                          Aucune déclaration publiée
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                          Tout député et sénateur est tenu de déposer une déclaration
                          d&apos;intérêts et d&apos;activités dans les 2 mois suivant son élection
                          (loi n°2013-907 du 11 octobre 2013). Le non-dépôt est passible de 3 ans
                          d&apos;emprisonnement, 45 000 € d&apos;amende et 10 ans
                          d&apos;inéligibilité. Seules les déclarations publiées par la HATVP sont
                          affichées ici.
                        </p>
                        <a
                          href="https://www.hatvp.fr/consulter-les-declarations/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-sm text-amber-700 dark:text-amber-300 underline hover:text-amber-900 dark:hover:text-amber-100"
                        >
                          Consulter le site de la HATVP →
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                ) : null
              }
              affairsContent={
                <AffairsSection affairs={politician.affairs} civility={politician.civility} />
              }
            />
          </div>

          {/* Sidebar (desktop): same summary component, hidden on mobile where it renders above the tabs. */}
          <div className="hidden lg:block space-y-6">
            <PoliticianSummary
              signals={signals}
              sources={sourceLinks}
              registres={registres}
              relationsHref={relationsHref}
              lastUpdated={lastUpdated}
            />
            <BetaDisclaimer variant="profile" />
          </div>
        </div>

        {(() => {
          const isDepute = currentMandate?.type === "DEPUTE";
          const isSenateur = currentMandate?.type === "SENATEUR";
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

const OS_DATASET_LABELS: Record<string, string> = {
  fr_assemblee: "Assemblée nationale",
  fr_senat: "Sénat",
  fr_maires: "Maires",
  wd_peps: "PEPs",
  ann_pep_positions: "PEPs",
  everypolitician: "EveryPolitician",
};
