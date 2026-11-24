import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { legacyCommunePath, territoireCommunePath } from "@/lib/territoires/paths";
import communeNames from "@/lib/territoires/commune-names.json";

const COMMUNE_NAMES: Record<string, string> = communeNames;

/**
 * Permanent redirect from a commune address written with the bare INSEE code to the readable
 * one. `src/proxy.ts` rewrites `/territoires/communes/29019` here: a page cannot answer a real
 * 308 (AGENTS.md §8), a Route Handler can.
 *
 * The destination is built from the commune name, never from the request. The name comes from
 * a table shipped with the code (`npm run generate:commune-names`): crawlers walk the old
 * addresses one commune at a time, so the CDN cache never answers twice and each redirect used
 * to cost a query, plus the time the instance then stays up for its idle connection. Only a code
 * missing from the table reads the database, which covers a commune created since.
 * A code no commune carries gets a 307 to the page, which answers the 404 of the site.
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

  const known = Object.hasOwn(COMMUNE_NAMES, legacy.code) ? COMMUNE_NAMES[legacy.code] : undefined;
  const commune = known
    ? { name: known }
    : await db.commune.findUnique({ where: { id: legacy.code }, select: { name: true } });

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
