import { Metadata } from "next";
import { DailyVotesPage } from "@/components/votes/DailyVotesPage";
import { getParisToday } from "@/lib/data/scrutins";

export const revalidate = 300; // ISR 5 min

export async function generateMetadata(): Promise<Metadata> {
  const today = getParisToday();
  const formatted = new Date(today + "T00:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // "Votes du jour" reads as a section name; naming the Parliament makes the
  // intent readable in a SERP without touching the ISR contract below.
  return {
    title: `Votes du Parlement aujourd'hui — ${formatted}`,
    description: `Consultez les scrutins de l'Assemblée nationale et du Sénat du ${formatted} : résultats et détails des votes parlementaires.`,
    alternates: { canonical: "/parlement/votes/aujourd-hui" },
  };
}

export default async function AujourdhuiPage() {
  const today = getParisToday();
  return <DailyVotesPage date={today} isToday />;
}
