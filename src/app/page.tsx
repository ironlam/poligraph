import { Metadata } from "next";
import { getWeeklyRecap, getWeekStart } from "@/lib/data/recap";
import { getFeaturedElection } from "@/lib/data/elections";
import { getHomepageKPIs } from "@/lib/data/homepage";
import { getEnabledFlags } from "@/lib/feature-flags";
import { HomeHero } from "@/components/home/HomeHero";
import { KPIStrip } from "@/components/home/KPIStrip";
import { ElectionBanner } from "@/components/home/ElectionBanner";
import { HomeIntentGrid } from "@/components/home/HomeIntentGrid";
import { PopularData } from "@/components/home/PopularData";
import { ActivityFeed } from "@/components/home/ActivityFeed";
import { TrustStrip } from "@/components/home/TrustStrip";
import { SupportCampaign } from "@/components/home/SupportCampaign";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Poligraph - Observatoire citoyen de la politique française",
  description:
    "Suivez les votes, affaires judiciaires, fact-checks et déclarations de patrimoine des politiques français. Données ouvertes, transparence citoyenne.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);

  const [kpis, weeklyRecap, featuredElection, enabledFlags] = await Promise.all([
    getHomepageKPIs(),
    getWeeklyRecap(currentWeekStart),
    getFeaturedElection(),
    getEnabledFlags(),
  ]);

  const daysUntil = featuredElection?.round1Date
    ? Math.ceil(
        (new Date(featuredElection.round1Date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="container mx-auto px-4 py-8 space-y-10">
      <HomeHero />

      {featuredElection && <ElectionBanner election={featuredElection} daysUntil={daysUntil} />}

      <KPIStrip kpis={kpis} />

      <HomeIntentGrid enabledFlags={enabledFlags} />

      <PopularData />

      <SupportCampaign />

      <ActivityFeed recap={weeklyRecap} />

      <TrustStrip />
    </div>
  );
}
