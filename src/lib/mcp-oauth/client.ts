/**
 * Client ID Metadata Document checks (draft-ietf-oauth-client-id-metadata-document). Claude sends an
 * HTTPS URL as client_id; the document behind it lists the redirect URIs the client may use.
 */

export interface ClientMetadata {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Returns the parsed URL when the client_id is an HTTPS URL on an allowed host, null otherwise. */
export function parseClientIdUrl(clientId: string, allowedHosts: string[]): URL | null {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.hash || url.pathname === "/" || url.pathname === "") return null;
  return allowedHosts.includes(url.hostname.toLowerCase()) ? url : null;
}

/** Validates the fetched JSON: its own client_id must equal the URL it was fetched from. */
export function parseClientMetadata(document: unknown, clientId: string): ClientMetadata | null {
  if (!document || typeof document !== "object") return null;
  const record = document as Record<string, unknown>;
  if (record.client_id !== clientId) return null;
  const redirectUris = record.redirect_uris;
  if (!Array.isArray(redirectUris) || !redirectUris.every((uri) => typeof uri === "string")) {
    return null;
  }
  // A public client: anything else means the document does not describe Claude's CIMD client.
  const authMethod = record.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") return null;
  return {
    clientId,
    clientName: typeof record.client_name === "string" ? record.client_name : null,
    redirectUris: redirectUris as string[],
  };
}

/**
 * Exact match, except for loopback redirects whose port is ignored (RFC 8252 §7.3): Claude Code
 * binds an ephemeral port and declares `http://localhost/callback` and `http://127.0.0.1/callback`.
 */
export function isRegisteredRedirect(requested: string, registered: string[]): boolean {
  if (registered.includes(requested)) return true;
  let requestedUrl: URL;
  try {
    requestedUrl = new URL(requested);
  } catch {
    return false;
  }
  if (requestedUrl.protocol !== "http:" || !LOOPBACK_HOSTS.has(requestedUrl.hostname)) {
    return false;
  }
  return registered.some((candidate) => {
    let candidateUrl: URL;
    try {
      candidateUrl = new URL(candidate);
    } catch {
      return false;
    }
    return (
      candidateUrl.protocol === "http:" &&
      candidateUrl.hostname === requestedUrl.hostname &&
      candidateUrl.pathname === requestedUrl.pathname &&
      candidateUrl.search === requestedUrl.search
    );
  });
}
