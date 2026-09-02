import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { Chamber } from "@/generated/prisma";
import { getVictimStats } from "@/lib/data/affairs";
import {
  getJudicialData,
  getFactCheckData,
  getLegislativeData,
  getGroupDynamicsData,
  getParticipationData,
} from "@/lib/data/statistics";
import { StatsTabs } from "@/components/stats/StatsTabs";
import { LegislativeSection } from "@/components/stats/LegislativeSection";
import { JudicialSection } from "@/components/stats/JudicialSection";
import { FactCheckSection } from "@/components/stats/FactCheckSection";
import { ParticipationSection } from "@/components/stats/ParticipationSection";
import { PresidentialEntry } from "@/components/stats/PresidentialEntry";
import { getHemicycleData } from "@/lib/data/hemicycle";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { getPresidentialOverviewStats } from "@/lib/data/presidential-stats";
import { SITE_URL } from "@/config/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Statistiques de la vie politique française",
  description:
    "Tableaux de bord sur les responsables politiques français : condamnations par parti, activité parlementaire, votes et fact-checks. Données ouvertes, méthodologie transparente.",
  alternates: { canonical: "/statistiques" },
};

// ── Page ─────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StatistiquesPage({ searchParams }: PageProps) {
  if (!(await isFeatureEnabled("STATISTIQUES_SECTION"))) notFound();

  const params = await searchParams;
  const pChamber =
    params.chamber === "AN" || params.chamber === "SENAT" ? (params.chamber as Chamber) : undefined;
  const pPage = Math.max(1, Math.min(100, parseInt(String(params.pPage ?? "1"), 10) || 1));
  const pSort = params.pSort === "desc" ? ("DESC" as const) : ("ASC" as const);

  const [
    legislativeData,
    judicialData,
    factCheckData,
    participationData,
    groupDynamicsData,
    hemicycleData,
    victimStats,
    presidentialStats,
  ] = await Promise.all([
    getLegislativeData(),
    getJudicialData(),
    getFactCheckData(),
    getParticipationData(pChamber, pPage, pSort),
    getGroupDynamicsData(),
    getHemicycleData(),
    getVictimStats(),
    getPresidentialOverviewStats("presidentielle-2027"),
  ]);

  return (
    <>
      <CollectionPageJsonLd
        name="Statistiques politiques de la France"
        description="Statistiques sur la vie politique française : travail législatif, transparence judiciaire, fact-checking."
        url={`${SITE_URL}/statistiques`}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Statistiques" }]} />
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">Statistiques</h1>
        <p className="text-muted-foreground mb-8">
          Vue d&apos;ensemble des données sur la vie politique française
        </p>

        <StatsTabs
          judicialContent={
            <JudicialSection
              maturityCounts={judicialData.maturityCounts}
              uniqueCondamnes={judicialData.uniqueCondamnes}
              uniqueMisEnCause={judicialData.uniqueMisEnCause}
              byStatus={judicialData.byStatus}
              byCategory={judicialData.byCategory}
              critiqueByCategory={judicialData.critiqueByCategory}
              hemicycleGroups={hemicycleData}
              victimStats={victimStats}
            />
          }
          factCheckContent={
            <FactCheckSection
              total={factCheckData.total}
              groups={factCheckData.groups}
              bySource={factCheckData.bySource}
              mostReliablePoliticians={factCheckData.mostReliablePoliticians}
              leastReliablePoliticians={factCheckData.leastReliablePoliticians}
              mostReliableParties={factCheckData.mostReliableParties}
              leastReliableParties={factCheckData.leastReliableParties}
            />
          }
          legislativeContent={
            <LegislativeSection
              stats={legislativeData}
              dynamicsAN={groupDynamicsData.dynamicsAN}
              dynamicsSENAT={groupDynamicsData.dynamicsSENAT}
            />
          }
          participationContent={
            <ParticipationSection
              groupDissidenceAN={participationData.groupDissidenceAN}
              groupDissidenceSENAT={participationData.groupDissidenceSENAT}
              chamber={pChamber}
            />
          }
        />
        {presidentialStats !== null ? <PresidentialEntry stats={presidentialStats} /> : null}
      </div>
    </>
  );
}
