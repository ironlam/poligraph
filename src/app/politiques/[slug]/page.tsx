import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCompactCurrency } from "@/lib/utils";
import {
  MANDATE_TYPE_LABELS,
  PARTY_ROLE_LABELS,
  feminizePartyRole,
  DATA_SOURCE_LABELS,
} from "@/config/labels";
import { ensureContrast } from "@/lib/contrast";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";
import { InteractiveTimeline } from "@/components/politicians/InteractiveTimeline";
import { PersonJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { DeclarationCard } from "@/components/declarations/DeclarationCard";
import { MarkdownText } from "@/components/ui/markdown";
import type { DeclarationDetails } from "@/types/hatvp";
import { Scale, FileText, Mail, Globe, Facebook } from "lucide-react";
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
import { FollowButton } from "@/components/politicians/FollowButton";
import { CopyableId } from "@/components/politicians/CopyableId";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { isJudiciallyValidated, getJudicialMaturity } from "@/config/judicial-maturity";

export const revalidate = 3600; // ISR: revalidate every hour

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
  cacheLife("minutes");

  const [stats, recentVotes, themeDistribution] = await Promise.all([
    getPoliticianVotingStats(politicianId),
    db.vote.findMany({
      where: { politicianId },
      include: {
        scrutin: {
          select: {
            id: true,
            title: true,
            votingDate: true,
            result: true,
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
        `${formatCompactCurrency(details.totalPortfolioValue)} de participations financières`
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

  return {
    title: politician.fullName,
    description,
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

  const hasMandates = politician.mandates.length > 0;
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

  // Split affairs by involvement for sidebar stats and timeline
  const directAffairs = politician.affairs.filter((a) => a.involvement === "DIRECT");

  // Tab badge: only judicially-validated affairs (Tier 1 + 2, DIRECT/INDIRECT)
  const validatedAffairsCount = politician.affairs.filter((a) => {
    if (
      a.involvement === "VICTIM" ||
      a.involvement === "PLAINTIFF" ||
      a.involvement === "MENTIONED_ONLY"
    )
      return false;
    return isJudiciallyValidated(a.status);
  }).length;

  // Sidebar: condamnation and en cours counts for DIRECT + INDIRECT
  const directAndIndirect = politician.affairs.filter(
    (a) => a.involvement === "DIRECT" || a.involvement === "INDIRECT"
  );
  const condamnationsCount = directAndIndirect.filter(
    (a) => getJudicialMaturity(a.status) === "CONDAMNATION"
  ).length;
  const proceduresEnCoursCount = directAndIndirect.filter((a) => {
    const m = getJudicialMaturity(a.status);
    return m === "PROCEDURE_VALIDEE" || m === "ENQUETE";
  }).length;

  // Encart: only condamnations (Tier 1)
  const encartAffairs = directAffairs.filter(
    (a) => getJudicialMaturity(a.status) === "CONDAMNATION"
  );
  const mentionAffairs = politician.affairs.filter(
    (a) => a.involvement === "INDIRECT" || a.involvement === "MENTIONED_ONLY"
  );
  const victimAffairs = politician.affairs.filter(
    (a) => a.involvement === "VICTIM" || a.involvement === "PLAINTIFF"
  );

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
        <Breadcrumb
          items={[{ label: "Politiques", href: "/politiques" }, { label: politician.fullName }]}
        />

        {/* Header */}
        <div className="flex items-start gap-6 mb-8">
          <PoliticianAvatar
            photoUrl={politician.photoUrl}
            firstName={politician.firstName}
            lastName={politician.lastName}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-display font-extrabold tracking-tight">
                {politician.fullName}
              </h1>
              <FollowButton slug={politician.slug} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {politician.currentParty && (
                <Link
                  href={
                    politician.currentParty.slug
                      ? `/partis/${politician.currentParty.slug}`
                      : "/partis"
                  }
                >
                  <Badge
                    className="text-sm hover:opacity-80 transition-opacity cursor-pointer whitespace-normal text-center"
                    style={{
                      backgroundColor: politician.currentParty.color
                        ? `${politician.currentParty.color}20`
                        : undefined,
                      color: politician.currentParty.color
                        ? ensureContrast(politician.currentParty.color, "#ffffff")
                        : undefined,
                    }}
                  >
                    {politician.currentParty.name}
                  </Badge>
                </Link>
              )}
              {currentGroup && (
                <Badge
                  variant="outline"
                  className="text-sm"
                  style={{
                    borderColor: currentGroup.color || undefined,
                    color: currentGroup.color
                      ? ensureContrast(currentGroup.color, "#ffffff")
                      : undefined,
                  }}
                >
                  Groupe {currentGroup.code}
                </Badge>
              )}
              {politician.partyHistory
                .filter((ph) => !ph.endDate && ph.role !== "MEMBRE")
                .map((ph) => (
                  <Badge key={ph.id} variant="outline" className="text-sm">
                    {feminizePartyRole(PARTY_ROLE_LABELS[ph.role], politician.civility)}
                    {ph.party.shortName !== politician.currentParty?.shortName &&
                      ` · ${ph.party.shortName}`}
                  </Badge>
                ))}
            </div>
            {(politician.contactEmail ||
              politician.contactTwitter ||
              politician.contactFacebook ||
              politician.contactWebsite) && (
              <div className="flex items-center gap-1 mt-2">
                {politician.contactEmail && (
                  <a
                    href={`mailto:${politician.contactEmail}`}
                    aria-label={`Envoyer un email à ${politician.fullName}`}
                    title="Email"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
                {politician.contactTwitter && (
                  <a
                    href={
                      politician.contactTwitter.startsWith("http")
                        ? politician.contactTwitter
                        : `https://x.com/${politician.contactTwitter.replace("@", "")}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Profil X de ${politician.fullName}`}
                    title="X (Twitter)"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {politician.contactFacebook && (
                  <a
                    href={
                      politician.contactFacebook.startsWith("http")
                        ? politician.contactFacebook
                        : `https://facebook.com/${politician.contactFacebook}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Page Facebook de ${politician.fullName}`}
                    title="Facebook"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Facebook className="h-4 w-4" />
                  </a>
                )}
                {politician.contactWebsite && (
                  <a
                    href={
                      politician.contactWebsite.startsWith("http")
                        ? politician.contactWebsite
                        : `https://${politician.contactWebsite}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Site web de ${politician.fullName}`}
                    title="Site web"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
            {politician.birthDate && (
              <p className="text-muted-foreground mt-2">
                {politician.civility === "Mme" ? "Née" : "Né"} le {formatDate(politician.birthDate)}
                {politician.birthPlace && ` à ${politician.birthPlace}`}
                {politician.deathDate && (
                  <span className="text-gray-500">
                    {" "}
                    - Décédé{politician.civility === "Mme" ? "e" : ""} le{" "}
                    {formatDate(politician.deathDate)}
                  </span>
                )}
              </p>
            )}
            {politician.publicId && (
              <div className="mt-1">
                <CopyableId value={politician.publicId} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            <ProfileTabs
              affairsCount={validatedAffairsCount}
              profileContent={
                <div className="space-y-8">
                  {/* Interactive Timeline - Desktop only */}
                  {(hasMandates || directAffairs.length > 0) && (
                    <div className="hidden lg:block">
                      <InteractiveTimeline
                        mandates={politician.mandates}
                        affairs={directAffairs}
                        birthDate={politician.birthDate}
                        deathDate={politician.deathDate}
                      />
                    </div>
                  )}

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

                  {/* Affairs summary card — only shows condemnations (Etabli + Prononce) */}
                  {encartAffairs.length > 0 && (
                    <Link
                      href={`/politiques/${politician.slug}?tab=affaires`}
                      prefetch={false}
                      scroll={false}
                      className="block"
                    >
                      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer group">
                        <CardContent className="py-4 flex items-center gap-4">
                          <div className="flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 size-10 shrink-0">
                            <Scale className="size-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">
                              {`${encartAffairs.length} condamnation${encartAffairs.length > 1 ? "s" : ""}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {encartAffairs
                                .slice(0, 2)
                                .map((a) => a.title)
                                .join(", ")}
                              {encartAffairs.length > 2 && "..."}
                            </p>
                          </div>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="size-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </CardContent>
                      </Card>
                    </Link>
                  )}

                  {/* Career / Mandates */}
                  {hasMandates && (
                    <Card id="parcours">
                      <CardHeader>
                        <h2 className="leading-none font-semibold">Parcours politique</h2>
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

                  {/* HATVP Declarations */}
                  {politician.declarations.length > 0 ? (
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
                      politicianHatvpUrl={
                        politician.externalIds.find((e) => e.source === "HATVP")?.url ?? null
                      }
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
                  ) : null}
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
                <CareerTimeline
                  mandates={politician.mandates}
                  partyHistory={politician.partyHistory}
                  affairs={directAffairs}
                  birthDate={politician.birthDate}
                  deathDate={politician.deathDate}
                />
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
              affairsContent={
                <AffairsSection affairs={politician.affairs} civility={politician.civility} />
              }
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick stats */}
            <Card>
              <CardHeader>
                <h2 className="leading-none font-semibold text-lg">En bref</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mandats</span>
                  <span className="font-semibold">{politician.mandates.length}</span>
                </div>
                {voteData && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Votes</span>
                    <span className="font-semibold">{voteData.stats.total}</span>
                  </div>
                )}
                {condamnationsCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Condamnations</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {condamnationsCount}
                    </span>
                  </div>
                )}
                {proceduresEnCoursCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Procédures en cours</span>
                    <span className="font-semibold">{proceduresEnCoursCount}</span>
                  </div>
                )}
                {mentionAffairs.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mentions</span>
                    <span className="font-semibold text-gray-500">{mentionAffairs.length}</span>
                  </div>
                )}
                {victimAffairs.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Victime</span>
                    <span className="font-semibold text-primary">{victimAffairs.length}</span>
                  </div>
                )}
                {politician.dossierAuthors.length > 0 && (
                  <div className="flex justify-between">
                    <Link
                      href={`/politiques/${politician.slug}#dossiers`}
                      className="text-muted-foreground hover:underline"
                    >
                      Propositions de loi
                    </Link>
                    <span className="font-semibold">{politician.dossierAuthors.length}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Déclarations HATVP</span>
                  <span className="font-semibold">{politician.declarations.length}</span>
                </div>
                {/* Relations link */}
                <div className="pt-3 border-t">
                  <Link
                    href={`/politiques/${politician.slug}/relations`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
                    </svg>
                    Voir les relations
                  </Link>
                </div>
              </CardContent>
            </Card>

            <BetaDisclaimer variant="profile" />

            {/* External links + data source */}
            <Card className="bg-muted">
              <CardContent className="pt-6">
                {politician.externalIds.filter((e) => e.url).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Liens externes</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {politician.externalIds
                        .filter((e) => e.url)
                        .map((ext) => (
                          <a
                            key={ext.source}
                            href={ext.url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {DATA_SOURCE_LABELS[ext.source]} ↗
                          </a>
                        ))}
                    </div>
                    <OpenSanctionsDatasets externalIds={politician.externalIds} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Dernière mise à jour : {formatDate(politician.updatedAt)}
                </p>
                <Link
                  href="/methodologie"
                  className="text-xs text-primary hover:underline mt-2 inline-block"
                >
                  Voir notre méthodologie
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
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

function OpenSanctionsDatasets({
  externalIds,
}: {
  externalIds: Array<{ source: string; metadata: unknown }>;
}) {
  const osEntry = externalIds.find((e) => e.source === "OPENSANCTIONS");
  if (!osEntry) return null;

  const meta = osEntry.metadata as { datasets?: string[] } | null;
  const datasets = meta?.datasets ?? [];
  const labels = [
    ...new Set(datasets.map((d) => OS_DATASET_LABELS[d]).filter((l): l is string => l != null)),
  ];

  if (labels.length === 0) return null;

  return (
    <p className="text-[10px] text-muted-foreground mt-1.5">Registres : {labels.join(", ")}</p>
  );
}
