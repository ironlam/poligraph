import {
  ACCESS_TOKEN_TTL_SECONDS,
  getEpoch,
  getIssuer,
  getResourceUrl,
  getSigningSecret,
  OFFLINE_SCOPE,
  SOCIAL_SCOPE,
} from "./config";
import {
  consumeAuthorizationCode,
  consumeRefreshToken,
  issueRefreshToken,
  type OAuthKv,
} from "./store";
import { generateOpaqueToken, signAccessToken, verifyPkce } from "./tokens";

/** Admin identity behind every token: the server has exactly one account. */
export const ADMIN_SUBJECT = "admin";

export interface TokenEndpointResponse {
  status: number;
  body: Record<string, unknown>;
}

function oauthError(error: string, description: string, status = 400): TokenEndpointResponse {
  return { status, body: { error, error_description: description } };
}

/** Keeps only scopes this server grants, so a token never claims more than consent covered. */
export function normalizeScope(requested: string | null): string {
  const granted = new Set([SOCIAL_SCOPE]);
  for (const scope of (requested ?? "").split(" ")) {
    if (scope === OFFLINE_SCOPE) granted.add(OFFLINE_SCOPE);
  }
  return [...granted].join(" ");
}

async function issueTokens(
  kv: OAuthKv,
  params: { clientId: string; scope: string; familyId: string; now: number }
): Promise<TokenEndpointResponse> {
  const issuedAt = Math.floor(params.now / 1000);
  const epoch = getEpoch();
  const accessToken = signAccessToken(
    {
      iss: getIssuer(),
      aud: getResourceUrl(),
      sub: ADMIN_SUBJECT,
      clientId: params.clientId,
      scope: params.scope,
      epoch,
      iat: issuedAt,
      exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
    },
    getSigningSecret()
  );
  const refreshToken = await issueRefreshToken(kv, {
    clientId: params.clientId,
    scope: params.scope,
    resource: getResourceUrl(),
    epoch,
    familyId: params.familyId,
  });
  return {
    status: 200,
    body: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: params.scope,
    },
  };
}

/**
 * Token endpoint (RFC 6749 §3.2) for a public client: no client secret, PKCE on the code grant and
 * refresh token rotation, as OAuth 2.1 requires of public clients.
 */
export async function handleTokenRequest(
  params: URLSearchParams,
  deps: { kv: OAuthKv; now?: number }
): Promise<TokenEndpointResponse> {
  const now = deps.now ?? Date.now();
  const grantType = params.get("grant_type");
  const clientId = params.get("client_id");
  if (!clientId) return oauthError("invalid_request", "client_id manquant.");

  const resource = params.get("resource");
  if (resource && resource !== getResourceUrl()) {
    return oauthError("invalid_target", "Ressource inconnue.");
  }

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const verifier = params.get("code_verifier");
    const redirectUri = params.get("redirect_uri");
    if (!code || !verifier || !redirectUri) {
      return oauthError("invalid_request", "code, code_verifier et redirect_uri sont requis.");
    }
    const record = await consumeAuthorizationCode(deps.kv, code);
    if (
      !record ||
      record.clientId !== clientId ||
      record.redirectUri !== redirectUri ||
      record.epoch !== getEpoch() ||
      !verifyPkce(verifier, record.codeChallenge)
    ) {
      return oauthError("invalid_grant", "Code invalide, expiré ou déjà utilisé.");
    }
    return issueTokens(deps.kv, {
      clientId,
      scope: record.scope,
      familyId: generateOpaqueToken(),
      now,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request", "refresh_token manquant.");
    const consumed = await consumeRefreshToken(deps.kv, refreshToken);
    if (
      consumed.status !== "ok" ||
      consumed.record.clientId !== clientId ||
      consumed.record.epoch !== getEpoch()
    ) {
      return oauthError("invalid_grant", "Jeton de rafraîchissement invalide ou révoqué.");
    }
    return issueTokens(deps.kv, {
      clientId,
      scope: consumed.record.scope,
      familyId: consumed.record.familyId,
      now,
    });
  }

  return oauthError("unsupported_grant_type", "Grant non pris en charge.");
}
