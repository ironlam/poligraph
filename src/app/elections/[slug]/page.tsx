import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { SENATORIALES_2026_SLUG } from "@/lib/data/senatoriales";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  ELECTION_TYPE_LABELS,
  ELECTION_TYPE_ICONS,
  ELECTION_STATUS_LABELS,
  ELECTION_STATUS_COLORS,
  ELECTION_SCOPE_LABELS,
  SUFFRAGE_TYPE_LABELS,
} from "@/config/labels";
import { ElectionCountdown } from "@/components/elections/ElectionCountdown";
import { ElectionUpcomingHero } from "@/components/elections/ElectionUpcomingHero";
import { ElectionKeyDates } from "@/components/elections/ElectionKeyDates";
import { ElectionScrutinInfo } from "@/components/elections/ElectionScrutinInfo";
import { AddToCalendar } from "@/components/elections/AddToCalendar";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { ELECTION_GUIDES } from "@/config/election-guides";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { CandidacyCard } from "@/components/elections/CandidacyCard";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import type { ElectionStatus } from "@/types";
import { SITE_URL } from "@/config/site";

export const revalidate = 3600; // ISR: revalidate every hour

export async function generateStaticParams() {
  const elections = await db.election.findMany({
    select: { slug: true },
    where: {
      type: { not: "MUNICIPALES" },
      // Elections with a dedicated portal: the static route wins at request time, so
      // prerendering the generic template for them builds a page nobody can reach.
      slug: { notIn: [PRESIDENTIELLE_2027_SLUG, SENATORIALES_2026_SLUG] },
    },
    take: 50,
    orderBy: { round1Date: "desc" },
  });
  return elections.map((e) => ({ slug: e.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const STATUS_ORDER: ElectionStatus[] = [
  "UPCOMING",
  "REGISTRATION",
  "CANDIDACIES",
  "CAMPAIGN",
  "ROUND_1",
  "BETWEEN_ROUNDS",
  "ROUND_2",
  "COMPLETED",
];

function isPhaseAtLeast(current: ElectionStatus, target: ElectionStatus): boolean {
  return STATUS_ORDER.indexOf(current) >= STATUS_ORDER.indexOf(target);
}

const getElection = cache(async function getElection(slug: string) {
  const election = await db.election.findUnique({
    where: { slug },
    include: {
      rounds: {
        orderBy: { round: "asc" },
      },
    },
  });
  if (!election) return null;

  // Municipal elections have 500K+ candidacies — skip loading them here.
  // They have dedicated portals (e.g., /elections/municipales-2026/).
  if (election.type === "MUNICIPALES") {
    const totalCandidacies = await db.candidacy.count({
      where: { electionId: election.id },
    });
    return { ...election, candidacies: [] as never[], totalCandidacies };
  }

  const candidaciesRaw = await db.candidacy.findMany({
    where: { electionId: election.id },
    include: {
      politician: {
        select: {
          id: true,
          slug: true,
          fullName: true,
          photoUrl: true,
          civility: true,
        },
      },
      party: {
        select: {
          id: true,
          slug: true,
          shortName: true,
          color: true,
        },
      },
    },
    orderBy: { candidateName: "asc" },
    take: 500,
  });
  // Prisma Decimal ne traverse pas la frontière RSC, on serialize ici.
  const candidacies = candidaciesRaw.map((c) => ({
    ...c,
    round1Pct: c.round1Pct == null ? null : Number(c.round1Pct),
    round2Pct: c.round2Pct == null ? null : Number(c.round2Pct),
  }));

  return { ...election, candidacies, totalCandidacies: candidacies.length };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const election = await getElection(slug);

  if (!election) {
    return missingEntityMetadata("Élection non trouvée");
  }

  const typeLabel = ELECTION_TYPE_LABELS[election.type];
  const title = `${election.title} | Poligraph`;
  const description =
    election.description ||
    `${typeLabel} - ${ELECTION_SCOPE_LABELS[election.scope]}. Dates, candidatures et résultats.`;

  return {
    title,
    description,
    openGraph: {
      title: election.title,
      description,
    },
    alternates: { canonical: `/elections/${slug}` },
  };
}

export default async function ElectionDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const election = await getElection(slug);

  if (!election) {
    notFound();
  }

  const icon = ELECTION_TYPE_ICONS[election.type];
  const statusLabel = ELECTION_STATUS_LABELS[election.status];
  const statusColor = ELECTION_STATUS_COLORS[election.status];
  const showCountdown = !isPhaseAtLeast(election.status, "ROUND_1") && election.round1Date;
  const typeLabel = ELECTION_TYPE_LABELS[election.type];
  const showGuideSection = await isFeatureEnabled("ELECTION_GUIDE_SECTION");

  return (
    <>
      <EventJsonLd
        name={election.title}
        description={
          election.description || `${typeLabel} - ${ELECTION_SCOPE_LABELS[election.scope]}`
        }
        startDate={election.round1Date?.toISOString() || ""}
        location="France"
        url={`${SITE_URL}/elections/${election.slug}`}
      />
      <main id="main-content" className="container mx-auto px-4 pt-4 pb-8 max-w-6xl">
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: election.shortTitle || election.title },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl" aria-hidden="true">
                  {icon}
                </span>
                <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight">
                  {election.title}
                </h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={statusColor}>{statusLabel}</Badge>
                <Badge variant="outline">{ELECTION_SCOPE_LABELS[election.scope]}</Badge>
                <Badge variant="outline">{SUFFRAGE_TYPE_LABELS[election.suffrage]}</Badge>
                {!election.dateConfirmed && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                    Dates provisoires
                  </Badge>
                )}
              </div>
            </div>

            {/* Municipales portal banner */}
            {election.type === "MUNICIPALES" && (
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-4 flex items-center gap-4">
                <span className="text-2xl" aria-hidden="true">
                  🏛️
                </span>
                <div className="flex-1">
                  <p className="font-semibold">
                    {election.totalCandidacies?.toLocaleString("fr-FR")} candidatures enregistrées
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Les élections municipales concernent plus de 35 000 communes. Consultez les
                    résultats commune par commune.
                  </p>
                </div>
                {slug === "municipales-2026" && (
                  <Link
                    href="/elections/municipales-2026"
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                  >
                    Explorer le portail &rarr;
                  </Link>
                )}
                {slug === "municipales-2020" && (
                  <Link
                    href="/elections/municipales-2020"
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                  >
                    Voir les résultats &rarr;
                  </Link>
                )}
                {slug === "municipales-2014" && (
                  <Link
                    href="/elections/municipales-2014"
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                  >
                    Voir les résultats &rarr;
                  </Link>
                )}
              </div>
            )}

            {/* Countdown / Upcoming Hero */}
            {showCountdown &&
              (election.candidacies.length === 0 &&
              !isPhaseAtLeast(election.status, "CANDIDACIES") ? (
                <ElectionUpcomingHero
                  targetDate={election.round1Date!.toISOString()}
                  dateConfirmed={election.dateConfirmed}
                  electionTitle={election.title}
                  electionIcon={icon}
                />
              ) : (
                <ElectionCountdown
                  targetDate={election.round1Date!.toISOString()}
                  electionTitle={election.title}
                  electionIcon={icon}
                  dateConfirmed={election.dateConfirmed}
                />
              ))}

            {/* Description */}
            {election.description && (
              <section>
                <h2 className="text-lg font-semibold mb-2">À propos</h2>
                <p className="text-muted-foreground leading-relaxed">{election.description}</p>
              </section>
            )}

            {/* Practical guide */}
            {showGuideSection && ELECTION_GUIDES[election.type] && (
              <section>
                <h2 className="text-lg font-semibold mb-4">Guide pratique</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ELECTION_GUIDES[election.type]!.map((guide) => (
                    <Card key={guide.title}>
                      <CardContent className="pt-5">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl shrink-0" aria-hidden="true">
                            {guide.icon}
                          </span>
                          <div>
                            <h3 className="font-semibold mb-1">{guide.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {guide.content}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Key dates */}
            <ElectionKeyDates
              registrationDeadline={election.registrationDeadline}
              candidacyOpenDate={election.candidacyOpenDate}
              candidacyDeadline={election.candidacyDeadline}
              campaignStartDate={election.campaignStartDate}
              round1Date={election.round1Date}
              round2Date={election.round2Date}
              dateConfirmed={election.dateConfirmed}
              status={election.status}
            />

            {/* Candidacies — skip for MUNICIPALES (500K+ rows, use dedicated portal) */}
            {isPhaseAtLeast(election.status, "CANDIDACIES") && election.type !== "MUNICIPALES" && (
              <section>
                <h2 className="text-lg font-semibold mb-4">Candidatures</h2>
                {election.candidacies.length > 0 ? (
                  <>
                    {/* Stats bar */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <Card>
                        <CardContent className="py-3 text-center">
                          <p className="text-xl font-bold tabular-nums">
                            {election.candidacies.length}
                          </p>
                          <p className="text-xs text-muted-foreground">candidats</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="py-3 text-center">
                          <p className="text-xl font-bold tabular-nums">
                            {
                              new Set(election.candidacies.map((c) => c.partyLabel).filter(Boolean))
                                .size
                            }
                          </p>
                          <p className="text-xs text-muted-foreground">partis</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="py-3 text-center">
                          <p className="text-xl font-bold tabular-nums">
                            {election.candidacies.filter((c) => c.isElected).length}
                          </p>
                          <p className="text-xs text-muted-foreground">élus</p>
                        </CardContent>
                      </Card>
                    </div>
                    {/* Grouped candidacies */}
                    {(() => {
                      const groups = new Map<string, typeof election.candidacies>();
                      for (const c of election.candidacies) {
                        const key = c.constituencyName || c.partyLabel || "Autres";
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)!.push(c);
                      }
                      const entries = Array.from(groups.entries()).sort((a, b) =>
                        a[0].localeCompare(b[0], "fr")
                      );

                      if (entries.length <= 1) {
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {election.candidacies.map((candidacy) => (
                              <CandidacyCard key={candidacy.id} candidacy={candidacy} />
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3">
                          {entries.map(([groupName, members]) => (
                            <details key={groupName} open={members.length <= 10}>
                              <summary className="cursor-pointer py-2 px-3 bg-muted/40 rounded-lg font-medium text-sm hover:bg-muted/60 transition-colors">
                                {groupName}
                                <span className="text-muted-foreground ml-2">
                                  ({members.length} candidat
                                  {members.length > 1 ? "s" : ""})
                                </span>
                              </summary>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 pl-3">
                                {members.map((candidacy) => (
                                  <CandidacyCard key={candidacy.id} candidacy={candidacy} />
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <p>Aucune candidature déclarée pour le moment.</p>
                      <p className="text-sm mt-1">
                        Les candidatures seront affichées dès leur officialisation.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </section>
            )}

            {/* Results */}
            {isPhaseAtLeast(election.status, "ROUND_1") && (
              <section>
                <h2 className="text-lg font-semibold mb-4">Résultats</h2>
                {election.rounds.length > 0 ? (
                  <div className="space-y-4">
                    {election.rounds.map((round) => (
                      <Card key={round.id}>
                        <CardContent className="pt-6">
                          <h3 className="font-semibold mb-3">
                            {round.round === 1 ? "1er tour" : "2nd tour"} — {formatDate(round.date)}
                          </h3>
                          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                            {round.registeredVoters && (
                              <div>
                                <dt className="text-muted-foreground">Inscrits</dt>
                                <dd className="font-medium">
                                  {round.registeredVoters.toLocaleString("fr-FR")}
                                </dd>
                              </div>
                            )}
                            {round.actualVoters && (
                              <div>
                                <dt className="text-muted-foreground">Votants</dt>
                                <dd className="font-medium">
                                  {round.actualVoters.toLocaleString("fr-FR")}
                                </dd>
                              </div>
                            )}
                            {round.participationRate && (
                              <div>
                                <dt className="text-muted-foreground">Participation</dt>
                                <dd className="font-medium">
                                  {Number(round.participationRate).toFixed(1)} %
                                </dd>
                              </div>
                            )}
                            {round.blankVotes != null && (
                              <div>
                                <dt className="text-muted-foreground">Votes blancs</dt>
                                <dd className="font-medium">
                                  {round.blankVotes.toLocaleString("fr-FR")}
                                </dd>
                              </div>
                            )}
                            {round.nullVotes != null && (
                              <div>
                                <dt className="text-muted-foreground">Votes nuls</dt>
                                <dd className="font-medium">
                                  {round.nullVotes.toLocaleString("fr-FR")}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <p>Les résultats seront disponibles après le scrutin.</p>
                    </CardContent>
                  </Card>
                )}
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Scrutin info */}
            <ElectionScrutinInfo
              type={election.type}
              scope={election.scope}
              suffrage={election.suffrage}
              totalSeats={election.totalSeats}
            />

            {/* Sources */}
            {(election.decreeUrl || election.sourceUrl) && (
              <Card>
                <CardContent className="pt-6">
                  <h2 className="text-lg font-semibold mb-3">Sources</h2>
                  <ul className="space-y-2 text-sm">
                    {election.decreeUrl && (
                      <li>
                        <a
                          href={election.decreeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Décret de convocation
                          <span className="sr-only">(ouvre un nouvel onglet)</span>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </li>
                    )}
                    {election.sourceUrl && (
                      <li>
                        <a
                          href={election.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Source officielle
                          <span className="sr-only">(ouvre un nouvel onglet)</span>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Add to calendar */}
            {election.round1Date && (
              <Card>
                <CardContent className="pt-6">
                  <h2 className="text-lg font-semibold mb-3">Ajouter au calendrier</h2>
                  <AddToCalendar
                    title={election.title}
                    round1Date={election.round1Date}
                    round2Date={election.round2Date}
                    slug={election.slug}
                    dateConfirmed={election.dateConfirmed}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
