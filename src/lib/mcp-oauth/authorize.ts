import type { ClientMetadataResult } from "@/lib/api/oauth-client-metadata";
import { getEpoch, getIssuer, getResourceUrl } from "./config";
import { isRegisteredRedirect } from "./client";
import { saveAuthorizationCode, type OAuthKv } from "./store";
import { normalizeScope } from "./token-endpoint";
import { isValidCodeChallenge } from "./tokens";

export interface AuthorizationRequest {
  clientId: string;
  clientHost: string;
  clientName: string | null;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
}

export type AuthorizationValidation =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; reason: string };

export interface AuthorizationParams {
  response_type?: string | null;
  client_id?: string | null;
  redirect_uri?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  state?: string | null;
  scope?: string | null;
  resource?: string | null;
}

/**
 * Checks an authorization request before anything is shown or redirected. A failure here never
 * redirects: until the client document vouches for the redirect URI, sending the browser there
 * would make this endpoint an open redirector.
 */
export async function validateAuthorizationRequest(
  params: AuthorizationParams,
  fetchMetadata: (clientId: string) => Promise<ClientMetadataResult>
): Promise<AuthorizationValidation> {
  if (params.response_type !== "code") {
    return { ok: false, reason: "response_type doit valoir « code »." };
  }
  if (!params.client_id || !params.redirect_uri) {
    return { ok: false, reason: "client_id et redirect_uri sont requis." };
  }
  if (params.code_challenge_method !== "S256" || !params.code_challenge) {
    return { ok: false, reason: "PKCE S256 obligatoire." };
  }
  if (!isValidCodeChallenge(params.code_challenge)) {
    return { ok: false, reason: "code_challenge invalide." };
  }
  if (params.resource && params.resource !== getResourceUrl()) {
    return { ok: false, reason: "Ressource inconnue." };
  }

  const metadata = await fetchMetadata(params.client_id);
  if (!metadata.ok) return { ok: false, reason: metadata.reason };
  if (!isRegisteredRedirect(params.redirect_uri, metadata.metadata.redirectUris)) {
    return { ok: false, reason: "redirect_uri absent du document client." };
  }

  return {
    ok: true,
    request: {
      clientId: params.client_id,
      clientHost: new URL(params.client_id).hostname,
      clientName: metadata.metadata.clientName,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      state: params.state ?? null,
      scope: normalizeScope(params.scope ?? null),
    },
  };
}

function redirectWith(request: AuthorizationRequest, values: Record<string, string>): string {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  if (request.state !== null) url.searchParams.set("state", request.state);
  // RFC 9207: lets the client check the response comes from the issuer it started with.
  url.searchParams.set("iss", getIssuer());
  return url.toString();
}

export async function approveAuthorization(
  kv: OAuthKv,
  request: AuthorizationRequest
): Promise<string> {
  const code = await saveAuthorizationCode(kv, {
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    resource: getResourceUrl(),
    epoch: getEpoch(),
  });
  return redirectWith(request, { code });
}

export function denyAuthorization(request: AuthorizationRequest): string {
  return redirectWith(request, {
    error: "access_denied",
    error_description: "Autorisation refusée.",
  });
}
