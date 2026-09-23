import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<Record<string, string>> };

type RouteHandler = (request: NextRequest, context: RouteContext) => Promise<Response>;

/**
 * Names the request for the error log, without letting that naming fail.
 *
 * `request.url` is a dynamic API: reading it while a route is being prerendered throws
 * `DynamicServerError`. In a catch block that throw replaces the error being reported, so the
 * failure we actually wanted to see disappears behind a misleading "Dynamic server usage" message.
 * Observed as POLIGRAPH-2T on /api/rss/factchecks.xml, whose stack runs through this wrapper.
 */
function describeRequest(request: NextRequest): string {
  try {
    return `${request.method} ${request.url}`;
  } catch {
    return "(requête non descriptible pendant un prérendu, URL indisponible)";
  }
}

/**
 * HOF wrapper for public API routes.
 * Catches unhandled errors and returns a consistent 500 response.
 */
export function withPublicRoute(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context: RouteContext) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error(`[API Error] ${describeRequest(request)}:`, error);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
  };
}
