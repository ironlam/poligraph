import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FactCheckSection } from "@/components/stats/FactCheckSection";
import { StatisticsPageLayout } from "@/components/stats/StatisticsPageLayout";
import { getFactCheckData } from "@/lib/data/statistics";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Statistiques du fact-checking politique",
  description:
    "Répartition des verdicts du fact-checking politique par source, personnalité et parti dans le corpus Poligraph.",
  alternates: { canonical: "/statistiques/factchecks" },
};

export default async function FactCheckStatisticsPage() {
  if (!(await isFeatureEnabled("STATISTIQUES_SECTION"))) notFound();
  const data = await getFactCheckData();

  return (
    <StatisticsPageLayout
      active="factchecks"
      title="Statistiques du fact-checking politique"
      description="Répartition des verdicts publiés dans le corpus de fact-checks de Poligraph."
    >
      <FactCheckSection
        total={data.total}
        groups={data.groups}
        bySource={data.bySource}
        topVraiSharePoliticians={data.topVraiSharePoliticians}
        topFauxSharePoliticians={data.topFauxSharePoliticians}
        topVraiShareParties={data.topVraiShareParties}
        topFauxShareParties={data.topFauxShareParties}
      />
    </StatisticsPageLayout>
  );
}
