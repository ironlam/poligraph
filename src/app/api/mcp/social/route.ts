import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import {
  getEpoch,
  getIssuer,
  getResourceUrl,
  getSigningSecret,
  OAuthConfigError,
} from "@/lib/mcp-oauth/config";
import { wwwAuthenticateHeader } from "@/lib/mcp-oauth/metadata";
import { verifyAccessToken } from "@/lib/mcp-oauth/tokens";
import { createSocialMcpServer } from "@/services/social/mcp-server";

// Publishing waits on two networks in sequence; the default 10 s budget is too tight for a retry.
export const maxDuration = 60;

const handler = createMcpHandler(
  (context) => createSocialMcpServer({ actor: `mcp:${context.authInfo?.clientId ?? "inconnu"}` }),
  { onerror: (error) => console.error("[mcp-social]", error) }
);

function unauthorized(description: string): NextResponse {
  // A 401 with this header is what makes Claude start the sign-in flow; a 200 tool error would not.
  return NextResponse.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: { "WWW-Authenticate": wwwAuthenticateHeader(description) } }
  );
}

async function handle(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return unauthorized("Authentification requise.");

  let claims;
  try {
    claims = verifyAccessToken(match[1]!, {
      secret: getSigningSecret(),
      issuer: getIssuer(),
      audience: getResourceUrl(),
      epoch: getEpoch(),
    });
  } catch (error) {
    if (error instanceof OAuthConfigError) {
      console.error("[mcp-social] configuration OAuth :", error.message);
      return NextResponse.json({ error: "server_error" }, { status: 503 });
    }
    throw error;
  }
  if (!claims) return unauthorized("Jeton invalide ou expiré.");

  return handler.fetch(request, {
    authInfo: {
      token: match[1]!,
      clientId: claims.clientId,
      scopes: claims.scope.split(" "),
      expiresAt: claims.exp,
    },
  });
}

const route = withPublicRoute((request) => handle(request));

export const POST = route;
export const GET = route;
export const DELETE = route;
