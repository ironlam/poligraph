import { permanentRedirect, redirect } from "next/navigation";
import { getWeekStart, getISOWeekString } from "@/lib/data/recap";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function RecapIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Backward compatibility: preserve the old ?week=YYYY-MM-DD URL pattern by
  // converting it to the new ISO week archive route.
  if (params.week) {
    const parsed = new Date(params.week + "T00:00:00Z");
    if (!Number.isNaN(parsed.getTime())) {
      const monday = getWeekStart(parsed);
      // 308: the old `?week=` URL moved for good. A temporary redirect tells Google to keep it
      // in the index instead of consolidating on the archive route.
      permanentRedirect(`/recap/${getISOWeekString(monday)}`);
    }
  }

  // Default: the current week is in progress; redirect to the last completed week.
  const now = new Date();
  const lastMonday = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  redirect(`/recap/${getISOWeekString(lastMonday)}`);
}
