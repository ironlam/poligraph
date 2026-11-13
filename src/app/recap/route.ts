import type { NextRequest } from "next/server";
import { getISOWeekString, getWeekStart } from "@/lib/data/recap";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `/recap` has no content of its own: it sends the reader to a week of the archive.
 *
 * A Route Handler rather than a page. In a page, `redirect()` and `permanentRedirect()` render an
 * HTML shell with a client-side refresh once streaming has started (the segment has a
 * `loading.tsx`), so a crawler never sees the status code. `Response.redirect` answers at the HTTP
 * layer, like `src/app/id/[publicId]/route.ts`.
 */
export function GET(request: NextRequest) {
  // Backward compatibility: the old `?week=YYYY-MM-DD` URL moved for good to the ISO week archive
  // route. 308, so that search engines consolidate on the archive URL instead of keeping this one.
  const week = request.nextUrl.searchParams.get("week");
  if (week) {
    const parsed = new Date(week + "T00:00:00Z");
    if (!Number.isNaN(parsed.getTime())) {
      const monday = getWeekStart(parsed);
      return Response.redirect(new URL(`/recap/${getISOWeekString(monday)}`, request.url), 308);
    }
  }

  // Default: the current week is in progress, so the target is the last completed week. 307,
  // because that target changes every Monday.
  const lastMonday = getWeekStart(new Date(Date.now() - WEEK_MS));
  return Response.redirect(new URL(`/recap/${getISOWeekString(lastMonday)}`, request.url), 307);
}
