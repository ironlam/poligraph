import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegislativeSection } from "@/components/stats/LegislativeSection";
import { StatisticsPageLayout } from "@/components/stats/StatisticsPageLayout";
import { getGroupDynamicsData, getLegislativeData } from "@/lib/data/statistics";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Statistiques de l’activité législative",
  description:
    "Scrutins, textes, thèmes et dynamiques des groupes parlementaires documentés par Poligraph.",
  alternates: { canonical: "/statistiques/legislatif" },
};

export default async function LegislativeStatisticsPage() {
  if (!(await isFeatureEnabled("STATISTIQUES_SECTION"))) notFound();
  const [data, dynamics] = await Promise.all([getLegislativeData(), getGroupDynamicsData()]);

  return (
    <StatisticsPageLayout
      active="legislatif"
      title="Statistiques de l’activité législative"
      description="Scrutins publics, textes et dynamiques des groupes à l’Assemblée nationale et au Sénat."
    >
      <LegislativeSection
        stats={data}
        dynamicsAN={dynamics.dynamicsAN}
        dynamicsSENAT={dynamics.dynamicsSENAT}
      />
    </StatisticsPageLayout>
  );
}
