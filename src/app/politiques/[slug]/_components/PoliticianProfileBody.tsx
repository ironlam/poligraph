import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { MarkdownText } from "@/components/ui/markdown";
import { StatusBadge } from "@/components/legislation";
import { BetaDisclaimer } from "@/components/BetaDisclaimer";
import { DeclarationCard } from "@/components/declarations/DeclarationCard";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";
import { ProfileTabs } from "@/components/politicians/ProfileTabs";
import { FactChecksTab } from "@/components/politicians/FactChecksTab";
import { CareerTimeline } from "@/components/politicians/CareerTimeline";
import { AffairsSection } from "@/components/politicians/AffairsSection";
import { VotesSection } from "@/components/politicians/VotesSection";
import { PoliticianSignals } from "@/components/politicians/PoliticianSignals";
import { PresumptionNotice } from "@/components/politicians/PresumptionNotice";
import { PoliticianSummary } from "@/components/politicians/PoliticianSummary";
import { computeJudicialCounts } from "@/lib/politicians/judicial-counts";
import { buildPoliticianSignals } from "@/lib/politicians/signals";
import { buildSourceLinks } from "@/lib/politicians/external-sources";
import type {
  PoliticianDossier,
  PoliticianIdentity,
  ProfileVoteStats,
} from "@/lib/data/politician-profile-reads";
import type { DeclarationDetails } from "@/types/hatvp";

const OS_DATASET_LABELS: Record<string, string> = {
  fr_assemblee: "Assemblée nationale",
  fr_senat: "Sénat",
  fr_maires: "Maires",
  wd_peps: "PEPs",
  ann_pep_positions: "PEPs",
  everypolitician: "EveryPolitician",
};

export interface PoliticianProfileBodyProps {
  politician: PoliticianIdentity;
  /** From the same precomputed document as `politician`, so the two cannot disagree. */
  dossier: PoliticianDossier;
  voteStats: ProfileVoteStats | null;
  /**
   * The current DEPUTE or SENATEUR mandate, resolved once by the page (`derivePoliticianPageModel`)
   * and handed down rather than re-derived here. It is not the mandate the profile headlines: a
   * parliamentarian who also holds a newer local mandate headlines the local one, and reading that
   * one here is how 42 profiles ended up serving an empty votes tab (#919).
   */
  currentParliamentaryMandate: {
    type: "DEPUTE" | "SENATEUR";
    title: string;
    constituency: string | null;
  } | null;
  currentGroup: { code: string; name: string; color: string | null } | null;
  isActiveParliamentarian: boolean;
  isChamberPresident: boolean;
}

export function PoliticianProfileBody({
  politician,
  dossier,
  voteStats,
  currentParliamentaryMandate,
  currentGroup,
  isActiveParliamentarian,
  isChamberPresident,
}: PoliticianProfileBodyProps) {
  const { affairs, factCheckMentions, dossierAuthors } = dossier;

  const voteData = voteStats?.voteData ?? null;
  const parliamentaryCard = voteStats?.parliamentaryCard ?? null;

  // directAffairs still feeds the Carrière timeline.
  const directAffairs = affairs.filter((a) => a.involvement === "DIRECT");

  // Judicial counters: "mis en cause" = DIRECT only (no double count with
  // mentions; enquêtes préliminaires excluded, RGPD art. 10 invariant).
  const judicial = computeJudicialCounts(
    affairs.map((a) => ({
      involvement: a.involvement,
      status: a.status,
      jurisdictionOrder: a.jurisdictionOrder,
    }))
  );

  const latestDIA = politician.declarations.find((d) => d.type === "INTERETS" && d.details);
  const portfolioValue =
    (latestDIA?.details as DeclarationDetails | null)?.totalPortfolioValue ?? null;

  const signals = buildPoliticianSignals({
    slug: politician.slug,
    mandatesCount: politician.mandates.length,
    votesTotal: voteData ? voteData.stats.total : null,
    hasVotesTab: Boolean((voteData && voteData.stats.total > 0) || parliamentaryCard),
    hasFactchecksTab: factCheckMentions.length > 0,
    factchecksCount: factCheckMentions.length,
    dossiersCount: dossierAuthors.length,
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

  const summary = (
    <PoliticianSummary
      signals={signals}
      sources={sourceLinks}
      registres={registres}
      relationsHref={relationsHref}
      lastUpdated={lastUpdated}
    />
  );

  return (
    <>
      {/* Summary before the tabbed body on mobile (DOM order matches reading order). */}
      <div className="lg:hidden mb-8">{summary}</div>

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
                {dossierAuthors.length > 0 && (
                  <Card id="dossiers">
                    <CardHeader>
                      <h2 className="leading-none font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Propositions de loi ({dossierAuthors.length})
                      </h2>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {dossierAuthors.map((da) => (
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
              factCheckMentions.length > 0 ? (
                <FactChecksTab mentions={factCheckMentions} politicianSlug={politician.slug} />
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
                        Liste des mandats nationaux et européens connus. Les mandats locaux (maire,
                        conseiller, etc.) peuvent ne pas être listés.
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
                  currentMandate={currentParliamentaryMandate}
                  currentGroup={currentGroup}
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
                        Tout député et sénateur est tenu de déposer une déclaration d&apos;intérêts
                        et d&apos;activités dans les 2 mois suivant son élection (loi n°2013-907 du
                        11 octobre 2013). Le non-dépôt est passible de 3 ans d&apos;emprisonnement,
                        45 000 € d&apos;amende et 10 ans d&apos;inéligibilité. Seules les
                        déclarations publiées par la HATVP sont affichées ici.
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
            affairsContent={<AffairsSection affairs={affairs} civility={politician.civility} />}
          />
        </div>

        {/* Sidebar (desktop): same summary component, hidden on mobile where it renders above the tabs. */}
        <div className="hidden lg:block space-y-6">
          {summary}
          <BetaDisclaimer variant="profile" />
        </div>
      </div>
    </>
  );
}
