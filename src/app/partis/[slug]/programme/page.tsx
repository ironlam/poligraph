import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getParty } from "@/lib/data/partis";
import { getPartyPlatform } from "@/lib/data/platforms";
import { getPartyPresidentialProgramme } from "@/lib/data/party-presidentielle";
import { PartyPresidentialSection } from "@/components/partis/PartyPresidentialSection";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { RadarChart } from "@/components/programmes/RadarChart";
import { PositionChart } from "@/components/programmes/PositionChart";
import { ProposalCard } from "@/components/programmes/ProposalCard";
import { THEMATIC_AXIS_SCOPE, QUIZ_ELECTION_SCOPE_LABELS } from "@/config/labels";
import type { ThematicAxis, QuizElectionScope, Proposal } from "@/generated/prisma";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!(await isFeatureEnabled("PROGRAMMES_ENABLED"))) return {};

  const { slug } = await params;
  const party = await getParty(slug);

  if (!party) return { title: "Parti non trouvé" };

  const [platform, presidential] = await Promise.all([
    getPartyPlatform(slug),
    getPartyPresidentialProgramme(party.id, slug),
  ]);
  const measureCount = presidential?.measureCount ?? 0;
  const candidateNames = presidential?.candidacies.map((c) => c.candidateName).join(", ") ?? "";
  const platformElection = platform?.election.title.toLowerCase() ?? null;

  const title =
    measureCount > 0
      ? `Programme de ${party.name} : mesures pour la présidentielle 2027`
      : platform
        ? `Programme de ${party.name} (${platform.election.title})`
        : `Programme de ${party.name}`;
  const description = [
    measureCount > 0
      ? `${measureCount.toLocaleString("fr-FR")} mesure${measureCount > 1 ? "s" : ""} publiée${measureCount > 1 ? "s" : ""} pour la présidentielle 2027 (${candidateNames}), classées par thème, avec leurs sources.`
      : null,
    platformElection
      ? `Positions de ${party.name} par axe thématique, d'après son programme des ${platformElection}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description: description || `Aucun programme de ${party.name} n'est documenté à ce jour.`,
    openGraph: {
      title: `${title} | Poligraph`,
      description,
      type: "article",
    },
    alternates: { canonical: `/partis/${slug}/programme` },
    // Nothing to read yet: keep the page reachable but out of the index.
    ...(measureCount === 0 && !platform ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PartyProgrammePage({ params }: PageProps) {
  if (!(await isFeatureEnabled("PROGRAMMES_ENABLED"))) notFound();

  const { slug } = await params;
  const [party, platform] = await Promise.all([getParty(slug), getPartyPlatform(slug)]);

  if (!party) notFound();

  const presidential = await getPartyPresidentialProgramme(party.id, slug);

  // Group proposals by scope
  const proposalsByScope = new Map<QuizElectionScope, Proposal[]>();
  if (platform) {
    for (const proposal of platform.proposals) {
      const scope = THEMATIC_AXIS_SCOPE[proposal.axis];
      const existing = proposalsByScope.get(scope) ?? [];
      existing.push(proposal);
      proposalsByScope.set(scope, existing);
    }
  }

  // Build positions map for chart
  const positions: Partial<Record<ThematicAxis, number>> = {};
  if (platform) {
    for (const p of platform.proposals) {
      positions[p.axis] = p.position;
    }
  }

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <BreadcrumbJsonLd
        items={[
          { name: "Accueil", url: SITE_URL },
          { name: "Programmes", url: `${SITE_URL}/programmes` },
          { name: party.name, url: `${SITE_URL}/partis/${slug}` },
          { name: "Programme", url: `${SITE_URL}/partis/${slug}/programme` },
        ]}
      />
      <Breadcrumb
        items={[
          { label: "Programmes", href: "/programmes" },
          { label: party.shortName || party.name, href: `/partis/${slug}` },
          { label: "Programme" },
        ]}
      />

      <div className="mt-6 space-y-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Programme de {party.name}
        </h1>

        {presidential && (
          <PartyPresidentialSection
            partyName={party.name}
            partySlug={slug}
            programme={presidential}
            variant="full"
          />
        )}

        {!platform ? (
          !presidential && (
            <p className="rounded-xl border p-6 text-muted-foreground">
              Aucun programme de {party.name} n&apos;est documenté à ce jour.
            </p>
          )
        ) : (
          <section aria-labelledby="platform-heading" className="space-y-8">
            <div>
              <h2 id="platform-heading" className="font-display text-2xl font-bold tracking-tight">
                Positions du parti aux {platform.election.title.toLowerCase()}
              </h2>
              <p className="mt-1 max-w-3xl text-muted-foreground">
                Ces positions sont établies d&apos;après le programme publié pour ce scrutin. Elles
                ne décrivent pas le programme de 2027.
              </p>
              {platform.sourceUrl && (
                <a
                  href={platform.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                  aria-label={`Programme source de ${party.name} (ouvre dans un nouvel onglet)`}
                >
                  Voir le programme complet
                </a>
              )}
            </div>

            {/* Radar chart */}
            {Object.keys(positions).length >= 3 && (
              <section aria-label="Radar des positions">
                <RadarChart positions={positions} color={party.color || "#3b82f6"} />
              </section>
            )}

            {/* Position scale */}
            {Object.keys(positions).length > 0 && (
              <section aria-label="Détail des positions par axe">
                <h3 className="text-lg font-semibold mb-4">Positionnement par axe</h3>
                <PositionChart
                  positions={positions}
                  color={party.color || "#3b82f6"}
                  className="max-w-2xl"
                />
              </section>
            )}

            {/* Proposals grouped by scope */}
            {(["COMMON", "NATIONAL", "MUNICIPAL"] as const).map((scope) => {
              const proposals = proposalsByScope.get(scope);
              if (!proposals || proposals.length === 0) return null;

              return (
                <section key={scope} aria-labelledby={`scope-${scope}`}>
                  <h3 id={`scope-${scope}`} className="text-lg font-semibold mb-4">
                    {QUIZ_ELECTION_SCOPE_LABELS[scope]}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {proposals.map((proposal) => (
                      <ProposalCard
                        key={proposal.id}
                        axis={proposal.axis}
                        position={proposal.position}
                        summary={proposal.summary}
                        sourceExcerpt={proposal.sourceExcerpt}
                        sourceUrl={proposal.sourceUrl}
                        aiGenerated={proposal.aiGenerated}
                        verifiedBy={proposal.verifiedBy}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
        )}

        {/* Methodology link: only the dated platform carries positions to explain */}
        {platform && (
          <p className="text-sm text-muted-foreground">
            <Link href="/sources" className="text-primary hover:underline">
              Comment sont déterminées ces positions ?
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
