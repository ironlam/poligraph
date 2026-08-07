import { Metadata } from "next";
import { getWeeklyRecap, getWeekStart } from "@/lib/data/recap";
import { getFeaturedElection } from "@/lib/data/elections";
import { getHomepageKPIs } from "@/lib/data/homepage";
import { getEnabledFlags } from "@/lib/feature-flags";
import { HomeHero } from "@/components/home/HomeHero";
import { KPIStrip } from "@/components/home/KPIStrip";
import { ElectionBanner } from "@/components/home/ElectionBanner";
import { HomeIntentGrid } from "@/components/home/HomeIntentGrid";
import { WeekFeed } from "@/components/home/WeekFeed";
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

  return (
    <div className="container mx-auto px-4 py-8 space-y-10">
      <HomeHero />

      {/* The banner derives its own temporal state: a day count computed here was the duplication
          that kept the other four states invisible from this page. */}
      {featuredElection && <ElectionBanner election={featuredElection} now={now} />}

      <HomeIntentGrid enabledFlags={enabledFlags} />

      <KPIStrip kpis={kpis} />

      <WeekFeed recap={weeklyRecap} />

      <SupportCampaign />

      <TrustStrip />
    </div>
  );
}
