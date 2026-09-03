import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Chamber } from "@/generated/prisma";
import { ParticipationSection } from "@/components/stats/ParticipationSection";
import { StatisticsPageLayout } from "@/components/stats/StatisticsPageLayout";
import { getParticipationData } from "@/lib/data/statistics";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Participation aux scrutins publics",
  description:
    "Données de participation et de dissidence lors des scrutins publics de l’Assemblée nationale et du Sénat.",
  alternates: { canonical: "/statistiques/participation" },
};

export default async function ParticipationStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isFeatureEnabled("STATISTIQUES_SECTION"))) notFound();
  const params = await searchParams;
  const chamber =
    params.chamber === "AN" || params.chamber === "SENAT" ? (params.chamber as Chamber) : undefined;
  const data = await getParticipationData(chamber);

  return (
    <StatisticsPageLayout
      active="participation"
      title="Participation aux scrutins publics"
      description="Participation et dissidence documentées dans les scrutins publics des deux chambres."
    >
      <ParticipationSection
        groupDissidenceAN={data.groupDissidenceAN}
        groupDissidenceSENAT={data.groupDissidenceSENAT}
        chamber={chamber}
      />
    </StatisticsPageLayout>
  );
}
