import { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getWeeklyRecap,
  getWeekStart,
  getWeekEnd,
  getISOWeekNumber,
  parseISOWeekString,
} from "@/lib/data/recap";
import { RecapView } from "@/components/recap/RecapView";
import { ArticleJsonLd } from "@/components/seo/JsonLd";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ week: string }>;
}

function formatRange(start: Date, end: Date): string {
  const endDisplay = new Date(end);
  endDisplay.setUTCDate(endDisplay.getUTCDate() - 1);
  const startDay = start.getUTCDate();
  const endDay = endDisplay.getUTCDate();
  const startMonth = start.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  const endMonth = endDisplay.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  const year = start.getUTCFullYear();
  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth} ${year}`;
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { week } = await params;
  const weekStart = parseISOWeekString(week);
  // Same two gates as the page below: an unparsable week and a future week both
  // end in notFound(), so neither URL may be offered to the index.
  if (!weekStart || weekStart > getWeekStart(new Date())) {
    return missingEntityMetadata("Recap introuvable");
  }
  const weekEnd = getWeekEnd(weekStart);
  const weekNum = getISOWeekNumber(weekStart);
  const range = formatRange(weekStart, weekEnd);
  return {
    title: `Le Recap parlementaire — Semaine ${weekNum}`,
    description: `Récapitulatif politique de la semaine du ${range}. Votes, activité parlementaire, affaires judiciaires, fact-checks et presse.`,
    alternates: { canonical: `/recap/${week}` },
  };
}

export default async function RecapWeekPage({ params }: PageProps) {
  const { week } = await params;
  const weekStart = parseISOWeekString(week);
  if (!weekStart) notFound();

  // Reject future weeks
  const currentWeekStart = getWeekStart(new Date());
  if (weekStart > currentWeekStart) notFound();

  const data = await getWeeklyRecap(weekStart);
  const weekEnd = getWeekEnd(weekStart);
  const weekNum = getISOWeekNumber(weekStart);
  const range = formatRange(weekStart, weekEnd);

  return (
    <>
      <ArticleJsonLd
        headline={`Le Recap parlementaire, semaine ${weekNum}`}
        description={`Récapitulatif politique de la semaine du ${range}. Votes, activité parlementaire, affaires judiciaires, fact-checks et presse.`}
        datePublished={weekStart.toISOString()}
        dateModified={weekEnd.toISOString()}
        url={`https://poligraph.fr/recap/${week}`}
        image={`https://poligraph.fr/recap/${week}/opengraph-image`}
      />
      <RecapView weekStart={weekStart} data={data} />
    </>
  );
}
