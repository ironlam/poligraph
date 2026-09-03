import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JudicialSection } from "@/components/stats/JudicialSection";
import { StatisticsPageLayout } from "@/components/stats/StatisticsPageLayout";
import { getVictimStats } from "@/lib/data/affairs";
import { getHemicycleData } from "@/lib/data/hemicycle";
import { getPresidentialOverviewStats } from "@/lib/data/presidential-stats";
import { getJudicialData } from "@/lib/data/statistics";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Statistiques de la vie politique française",
  description:
    "Statistiques sur la vie politique française : affaires judiciaires, fact-checking, activité législative et participation.",
  alternates: { canonical: "/statistiques" },
};

export default async function StatistiquesPage() {
  if (!(await isFeatureEnabled("STATISTIQUES_SECTION"))) notFound();

  const [judicialData, hemicycleData, victimStats, presidentialStats] = await Promise.all([
    getJudicialData(),
    getHemicycleData(),
    getVictimStats(),
    getPresidentialOverviewStats("presidentielle-2027"),
  ]);

  return (
    <StatisticsPageLayout
      active="judiciaire"
      title="Statistiques de la vie politique française"
      description="Affaires judiciaires documentées, fact-checking, activité législative et participation politique."
      presidentialStats={presidentialStats}
    >
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
    </StatisticsPageLayout>
  );
}
