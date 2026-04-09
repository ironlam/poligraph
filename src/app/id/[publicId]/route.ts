import type { NextRequest } from "next/server";
import { resolvePublicId } from "@/lib/public-ids";

/**
 * Stable poligraphId resolver — HTTP-level implementation.
 *
 * Accepts any valid poligraphId (PG-000542, AF-004217, FC-002891, etc.) and
 * issues a **raw HTTP 308 Permanent Redirect** to the canonical application
 * URL. Research papers, Wikipedia, Wikidata, and CLI tools can cite the
 * identifier URL and it will keep resolving even if the target slug is
 * corrected, the entity is merged, or the taxonomy is reorganised — because
 * the poligraphId itself is immutable once assigned.
 *
 * Why a Route Handler instead of a page component:
 * In Next.js 16, calling `permanentRedirect()` from a server `page.tsx`
 * renders a full HTML shell (~90 KB) with a client-side meta refresh and
 * a React Flight digest — optimised for soft-nav in a browser, but useless
 * for crawlers, `curl -I`, academic link checkers, and Wikipedia preview
 * bots, which all expect a real 308 at the HTTP layer. A Route Handler
 * returning `Response.redirect(..., 308)` gives everyone the correct behaviour.
 *
 * SEO: crawlers follow the 308 and index only the canonical slug URL. The
 * `/id/*` path never competes with the destination in search results. This
 * is how doi.org, orcid.org, and wikidata.org/wiki/Q42 all work.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;
  const normalised = decodeURIComponent(publicId).trim().toUpperCase();

  const resolved = await resolvePublicId(normalised);

  if (!resolved) {
    return new Response("poligraphId not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const destination = new URL(resolved.canonicalPath, request.url);
  return Response.redirect(destination, 308);
}
