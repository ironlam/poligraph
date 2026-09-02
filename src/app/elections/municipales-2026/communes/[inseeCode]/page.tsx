import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  getCommune,
  getCommuneHistorique2020,
  getCommuneHistorique2014,
} from "@/lib/data/municipales";
import { CommuneRadiographie } from "@/components/elections/municipales/CommuneRadiographie";
import { ListCard } from "@/components/elections/municipales/ListCard";
import { AlerteCumul } from "@/components/elections/municipales/PoliticianBridge";
import { IncumbentMaireCard } from "@/components/elections/municipales/IncumbentMaireCard";
import { NATIONAL_MANDATE_TYPES } from "@/config/labels";
import { HistoriqueSection } from "@/components/elections/municipales/HistoriqueSection";
import { ResultatsBanner } from "@/components/elections/municipales/ResultatsBanner";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SITE_URL } from "@/config/site";
import { db } from "@/lib/db";
import { communeRobotsMetadata } from "@/lib/seo/commune-robots";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

export async function generateStaticParams() {
  const communes = await db.commune.findMany({
    select: { id: true },
    orderBy: { population: "desc" },
    take: 50,
  });
  return communes.map((c) => ({ inseeCode: c.id }));
}

interface PageProps {
  params: Promise<{ inseeCode: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { inseeCode } = await params;
  const commune = await getCommune(inseeCode);

  if (!commune) {
    return missingEntityMetadata("Commune non trouvée");
  }

  const { stats } = commune;
  const title = `Municipales 2026 à ${commune.name} — Candidats et listes | Poligraph`;
  const description = `Découvrez les ${stats.listCount} listes et ${stats.candidateCount} candidats aux élections municipales 2026 à ${commune.name} (${commune.departmentName}).`;

  return {
    title,
    description,
    // Panachage communes (<1000 hab) are thin candidate rosters: noindex,follow (issue #385).
    ...communeRobotsMetadata(commune.population),
    openGraph: {
      title,
      description,
    },
    alternates: { canonical: `/elections/municipales-2026/communes/${inseeCode}` },
  };
}

export default async function CommuneDetailPage({ params }: PageProps) {
  const { inseeCode } = await params;
  const commune = await getCommune(inseeCode);
  const historique2020 = await getCommuneHistorique2020(inseeCode);
  const historique2014 = await getCommuneHistorique2014(inseeCode);

  if (!commune) {
    notFound();
  }

  const communeUrl = `${SITE_URL}/elections/municipales-2026/communes/${commune.id}`;

  return (
    <>
      {commune.round1Date && (
        <EventJsonLd
          name={`Municipales 2026 - ${commune.name}`}
          description={`Élections municipales 2026 à ${commune.name} (${commune.departmentName})`}
          startDate={commune.round1Date.toISOString()}
          location={commune.name}
          url={communeUrl}
        />
      )}
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl">
        <Breadcrumb
          items={[
            { label: "Élections", href: "/elections" },
            { label: "Municipales 2026", href: "/elections/municipales-2026" },
            { label: commune.name },
          ]}
        />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mb-3">
            Municipales 2026 — {commune.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {commune.departmentName} ({commune.departmentCode})
            </Badge>
            {commune.population != null && (
              <Badge variant="outline">
                {commune.population.toLocaleString("fr-FR")} habitants
              </Badge>
            )}
            {commune.totalSeats != null && (
              <Badge variant="outline">{commune.totalSeats} sièges</Badge>
            )}
          </div>
        </div>

        {/* Results banner (only if results available) */}
        {commune.hasResults &&
          (() => {
            const electedList = commune.lists.find((l) => l.isElected);
            // For T2: sort by round2Pct to find the leading list
            const topList =
              electedList ||
              (commune.hasT2Results
                ? [...commune.lists].sort((a, b) => (b.round2Pct ?? 0) - (a.round2Pct ?? 0))[0]
                : commune.lists[0]);
            const qualifiedCount = commune.lists.filter((l) => l.round1Qualified).length;
            const round2Passed = commune.round2Date && new Date(commune.round2Date) < new Date();

            return (
              <ResultatsBanner
                topList={
                  topList?.round1Pct != null
                    ? {
                        name: topList.name,
                        leaderName: topList.teteDeListe.candidateName,
                        partyLabel: topList.partyLabel,
                        round1Pct: topList.round1Pct,
                        round1Votes: topList.round1Votes!,
                        round2Pct: topList.round2Pct,
                        round2Votes: topList.round2Votes,
                        isElected: topList.isElected,
                      }
                    : null
                }
                participation={commune.participation}
                listCount={commune.stats.listCount}
                qualifiedCount={qualifiedCount}
                electionCompleted={!!round2Passed}
                round2Date={
                  !electedList && commune.round2Date && new Date(commune.round2Date) > new Date()
                    ? new Date(commune.round2Date).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                      })
                    : null
                }
              />
            );
          })()}

        {/* Alerte cumul */}
        {commune.stats.nationalPoliticiansCount > 0 &&
          (() => {
            const nationalSet = new Set<string>(NATIONAL_MANDATE_TYPES);
            const mandateTypes = [
              ...new Set(
                commune.lists
                  .flatMap((l) => l.members)
                  .filter((m) => m.politician?.mandates?.length)
                  .flatMap((m) => m.politician!.mandates.map((md) => md.type))
                  .filter((t) => nationalSet.has(t))
              ),
            ];
            return (
              <div className="mb-6">
                <AlerteCumul
                  count={commune.stats.nationalPoliticiansCount}
                  mandateTypes={mandateTypes}
                />
              </div>
            );
          })()}

        {/* Incumbent mayor */}
        {commune.incumbentMaire &&
          (() => {
            const round2Passed = commune.round2Date && new Date(commune.round2Date) < new Date();
            return (
              <div className="mb-6">
                <IncumbentMaireCard
                  maire={commune.incumbentMaire.maire}
                  isRunningAgain={commune.incumbentMaire.isRunningAgain}
                  electionCompleted={!!round2Passed}
                  resultStatus={
                    commune.hasResults &&
                    commune.incumbentMaire.isRunningAgain &&
                    commune.incumbentMaire.candidacy
                      ? (() => {
                          const maireList = commune.lists.find(
                            (l) => l.name === commune.incumbentMaire!.candidacy!.listName
                          );
                          if (!maireList || maireList.round1Pct == null) return null;
                          if (maireList.isElected) return "reelected" as const;
                          // T2 results available: qualified but not elected = defeated
                          if (commune.hasT2Results && maireList.round2Pct != null)
                            return "defeated" as const;
                          if (maireList.round1Qualified) return "runoff" as const;
                          return "defeated" as const;
                        })()
                      : null
                  }
                />
              </div>
            );
          })()}

        {/* Radiographie */}
        <section className="mb-8">
          <CommuneRadiographie
            listCount={commune.stats.listCount}
            candidateCount={commune.stats.candidateCount}
            population={commune.population}
            totalSeats={commune.totalSeats}
            femaleRate={commune.stats.femaleRate}
            nationalPoliticiansCount={commune.stats.nationalPoliticiansCount}
            participationRate={commune.participation?.participationRate}
          />
        </section>

        {/* Historique 2020 */}
        {historique2020 && (
          <section className="mb-8">
            <HistoriqueSection data={historique2020} year={2020} />
          </section>
        )}

        {/* Historique 2014 */}
        {historique2014 && (
          <section className="mb-8">
            <HistoriqueSection data={historique2014} year={2014} />
          </section>
        )}

        {/* Lists & candidates */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            {commune.hasResults ? "Résultats par liste" : "Listes et candidats"}
          </h2>
          {commune.lists.length > 0 ? (
            <div className="space-y-4">
              {commune.lists.map((list) => (
                <ListCard
                  key={list.name}
                  name={list.name}
                  partyLabel={list.partyLabel}
                  candidateCount={list.candidateCount}
                  femaleCount={list.femaleCount}
                  teteDeListe={list.teteDeListe}
                  members={list.members}
                  incumbentMaireLastName={commune.incumbentMaire?.maire.lastName ?? null}
                  incumbentMaireGender={commune.incumbentMaire?.maire.gender ?? null}
                  round1Pct={list.round1Pct}
                  round1Votes={list.round1Votes}
                  round1Qualified={list.round1Qualified}
                  round2Pct={list.round2Pct}
                  round2Votes={list.round2Votes}
                  isElected={list.isElected}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Aucune liste déposée pour le moment.</p>
          )}
        </section>
      </div>
    </>
  );
}
