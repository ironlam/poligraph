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
import { deriveElectionBannerState } from "@/lib/elections/banner-state";
import { daysUntil } from "@/lib/elections/countdown";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";

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

  // Far from the vote, the presidential card of the grid is the only reminder and carries the
  // countdown. The banner comes back from the last month on, when it has something the card
  // cannot say: the registration deadline, the day of the vote, the results.
  const bannerState =
    featuredElection &&
    deriveElectionBannerState({
      round1Date: featuredElection.round1Date,
      round2Date: featuredElection.round2Date,
      now,
      round1Scores: featuredElection.round1Scores,
      winner: featuredElection.winner,
    });
  const showBanner = featuredElection && bannerState && bannerState.kind !== "FAR";
  const daysToPresidentialRound1 =
    featuredElection?.slug === PRESIDENTIELLE_2027_SLUG && featuredElection.round1Date
      ? daysUntil(featuredElection.round1Date, now)
      : null;

  return (
    <div className="container mx-auto space-y-5 px-4 py-4 sm:space-y-10 sm:py-8">
      <HomeHero />

      {showBanner && <ElectionBanner election={featuredElection} now={now} />}

      <HomeIntentGrid
        enabledFlags={enabledFlags}
        daysToPresidentialRound1={daysToPresidentialRound1}
      />

      <WeekFeed recap={weeklyRecap} />

      <KPIStrip kpis={kpis} />

      <SupportCampaign />

      <TrustStrip />
    </div>
  );
}
