import {
  AUTHORIZE_PATH,
  getIssuer,
  getProtectedResourceMetadataUrl,
  getResourceUrl,
  OFFLINE_SCOPE,
  SOCIAL_SCOPE,
  TOKEN_PATH,
} from "./config";

/** RFC 9728. `resource` must equal the URL entered in Claude, path included. */
export function protectedResourceMetadata() {
  return {
    resource: getResourceUrl(),
    authorization_servers: [getIssuer()],
    scopes_supported: [SOCIAL_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Poligraph, publication sociale",
  };
}

/**
 * RFC 8414. Claude picks a Client ID Metadata Document only when both
 * `client_id_metadata_document_supported` and the `none` auth method are advertised; there is no
 * registration endpoint, so nothing else can register a client here.
 */
export function authorizationServerMetadata() {
  const issuer = getIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}${AUTHORIZE_PATH}`,
    token_endpoint: `${issuer}${TOKEN_PATH}`,
    scopes_supported: [SOCIAL_SCOPE, OFFLINE_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  };
}

export function wwwAuthenticateHeader(description: string): string {
  // Quotes would end the parameter early; the description is ours, but keep the header well formed.
  const safeDescription = description.replace(/"/g, "'");
  return (
    `Bearer error="invalid_token", error_description="${safeDescription}", ` +
    `resource_metadata="${getProtectedResourceMetadataUrl()}", scope="${SOCIAL_SCOPE}"`
  );
}
