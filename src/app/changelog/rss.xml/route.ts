import { CHANGELOG_TYPE_LABELS } from "@/config/labels";
import { buildChangelogRss } from "@/lib/changelog/format";
import { getPublishedChangelog } from "@/lib/data/changelog";

export async function GET() {
  const entries = await getPublishedChangelog();
  return new Response(buildChangelogRss(entries, CHANGELOG_TYPE_LABELS), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
