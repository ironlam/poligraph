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
 * The answer is cacheable: an old address costs one query, then the CDN answers.
 */
export const GET = withPublicRoute(async (request: NextRequest) => {
  // Behind the proxy rewrite the request keeps its original address (measured on a real
  // request: the rewritten query string never reaches the handler), so the path is read first.
  // The query string is the fallback for a runtime that would hand over the rewritten URL.
  // Both go through the parser the proxy uses: only a known shape reaches the database.
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
  if (!commune) return NextResponse.json({ error: "Commune introuvable" }, { status: 404 });

  // The query string of the old address is kept (the elections page filters on `?type=`).
  const query = viaProxy ? request.nextUrl.search : "";
  const destination = `${territoireCommunePath(legacy.code, commune.name)}${legacy.suite}${query}`;
  return new NextResponse(null, {
    status: 308,
    headers: {
      Location: new URL(destination, request.url).toString(),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
});
