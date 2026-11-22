import { SITE_URL } from "@/config/site";

/**
 * Single-account OAuth 2.1 server protecting the social MCP endpoint. Only the Poligraph admin can
 * consent, so the server has no user table: the admin session is the identity.
 */

export const MCP_SOCIAL_PATH = "/api/mcp/social";
export const AUTHORIZE_PATH = "/admin/oauth/autoriser";
export const TOKEN_PATH = "/api/oauth/token";
export const SOCIAL_SCOPE = "social";
export const OFFLINE_SCOPE = "offline_access";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;

const DEFAULT_CLIENT_HOSTS = ["claude.ai", "claude.com"];
const MIN_SECRET_BYTES = 32;

export class OAuthConfigError extends Error {}

export function getIssuer(): string {
  return SITE_URL.replace(/\/$/, "");
}

/** The resource URL Claude stores: tokens are minted for it and only it (RFC 8707 audience). */
export function getResourceUrl(): string {
  return `${getIssuer()}${MCP_SOCIAL_PATH}`;
}

export function getProtectedResourceMetadataUrl(): string {
  return `${getIssuer()}/.well-known/oauth-protected-resource${MCP_SOCIAL_PATH}`;
}

export function getSigningSecret(): string {
  const secret = process.env.MCP_OAUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new OAuthConfigError("MCP_OAUTH_SECRET absent ou trop court (32 octets minimum).");
  }
  return secret;
}

/** Bumping the epoch revokes every access and refresh token at once. */
export function getEpoch(): number {
  const raw = process.env.MCP_OAUTH_EPOCH;
  if (!raw) return 0;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new OAuthConfigError("MCP_OAUTH_EPOCH invalide.");
  return Number(raw);
}

/**
 * Hosts allowed to serve a Client ID Metadata Document. Fetching the client_id URL is an outbound
 * request decided by the caller, so the allowlist is what keeps it from becoming an SSRF vector.
 */
export function getAllowedClientHosts(): string[] {
  const raw = process.env.MCP_OAUTH_CLIENT_HOSTS;
  if (!raw) return DEFAULT_CLIENT_HOSTS;
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}
