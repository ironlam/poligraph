import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { describeRequest } from "./with-public-route";

type RouteContext = { params: Promise<Record<string, string>> };

type RouteHandler = (request: NextRequest, context: RouteContext) => Promise<NextResponse>;

/**
 * HOF wrapper for admin API routes.
 * Checks authentication and catches unhandled errors.
 */
export function withAdminAuth(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    try {
      return await handler(request, context);
    } catch (error) {
      // Same split as the public wrapper: an URL carrying `%s` must not consume `error`.
      console.error("[API Error]", `${describeRequest(request)}:`, error);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
  };
}
