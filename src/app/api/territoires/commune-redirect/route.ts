import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { legacyCommunePath, territoireCommunePath } from "@/lib/territoires/paths";

/**
 * Permanent redirect from a commune address written with the bare INSEE code to the readable
 * one. `src/proxy.ts` rewrites `/territoires/communes/29019` here: a page cannot answer a real
 * 308 (AGENTS.md §8), a Route Handler can.
 *
 * The destination is built from the commune name read by primary key, never from the request.
 * A code no commune carries gets a 307 to the page, which answers the 404 of the site.
 * The answer is cacheable: an old address costs one query, then the CDN answers.
 */
export const GET = withPublicRoute(async (request: NextRequest) => {
  // Behind the proxy rewrite the request keeps its original path, so the path is read first.
  // What happens to the query string depends on the runtime: `next dev` hands over the original
  // one, Vercel merges the `code` and `suite` of the rewrite into it (seen in production on
  // 2026-11-15). The query string is only the fallback for a runtime that would hand over the
  // rewritten URL. Both go through the parser the proxy uses: only a known shape reaches the
  // database.
  const { pathname, searchParams } = request.nextUrl;
  const viaProxy = legacyCommunePath(pathname);
  const legacy =
    viaProxy ??
    legacyCommunePath(
      `/territoires/communes/${searchParams.get("code") ?? ""}${searchParams.get("suite") ?? ""}`
    );
  if (!legacy) return NextResponse.json({ error: "Adresse invalide" }, { status: 400 });

  const commune = await db.commune.findUnique({
    where: { id: legacy.code },
    select: { name: true },
  });

  // Unknown code: a Route Handler cannot render the 404 page of the site (`notFound()` answers
  // an empty body here), so the visitor is sent to a readable-shaped address, which the proxy
  // does not rewrite and where the page renders its own not-found. Temporary: the code may
  // exist one day.
  const name = commune?.name ?? "commune";

  // The query string of the old address is kept (the elections page filters on `?type=`),
  // minus the two parameters of the rewrite: they are internal and never belong in an address.
  const kept = new URLSearchParams(request.nextUrl.search);
  kept.delete("code");
  kept.delete("suite");
  const query = kept.size > 0 ? `?${kept}` : "";
  const destination = `${territoireCommunePath(legacy.code, name)}${legacy.suite}${query}`;
  return new NextResponse(null, {
    status: commune ? 308 : 307,
    headers: {
      Location: new URL(destination, request.url).toString(),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
});
