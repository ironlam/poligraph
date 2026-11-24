import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { fetchClientMetadata } from "@/lib/api/oauth-client-metadata";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";
import { oauthConsentSchema } from "@/lib/security/schemas/mcp-oauth";
import { getAllowedClientHosts } from "@/lib/mcp-oauth/config";
import {
  approveAuthorization,
  denyAuthorization,
  validateAuthorizationRequest,
} from "@/lib/mcp-oauth/authorize";
import { getOAuthKv } from "@/lib/mcp-oauth/store";

export const POST = withAdminAuth(
  withValidation(oauthConsentSchema, async (request, _context, body) => {
    // The page already validated, but the POST is its own request: everything is checked again.
    const validation = await validateAuthorizationRequest(body, (clientId) =>
      fetchClientMetadata(clientId, getAllowedClientHosts())
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    let redirectTo: string;
    if (body.decision === "approve") {
      redirectTo = await approveAuthorization(getOAuthKv(), validation.request);
    } else {
      redirectTo = denyAuthorization(validation.request);
    }

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: body.decision === "approve" ? "MCP_OAUTH_GRANT" : "MCP_OAUTH_DENY",
        entityType: "OAuthClient",
        entityId: validation.request.clientId.slice(0, 255),
        changes: {
          redirectHost: new URL(validation.request.redirectUri).host,
          scope: validation.request.scope,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return NextResponse.json({ redirectTo });
  })
);
