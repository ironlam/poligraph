import { parseClientIdUrl, parseClientMetadata, type ClientMetadata } from "@/lib/mcp-oauth/client";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_DOCUMENT_BYTES = 64 * 1024;

export type ClientMetadataResult =
  | { ok: true; metadata: ClientMetadata }
  | { ok: false; reason: string };

/**
 * Fetches a Client ID Metadata Document. The host allowlist is checked before any request, and
 * redirects are refused so an allowed host cannot bounce the fetch somewhere else.
 */
export async function fetchClientMetadata(
  clientId: string,
  allowedHosts: string[]
): Promise<ClientMetadataResult> {
  const url = parseClientIdUrl(clientId, allowedHosts);
  if (!url) {
    return {
      ok: false,
      reason: `client_id non autorisé (hôtes acceptés : ${allowedHosts.join(", ")}).`,
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "Document client injoignable." };
  }
  if (!response.ok) return { ok: false, reason: `Document client : HTTP ${response.status}.` };
  if (Number(response.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "Document client trop volumineux." };
  }

  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "Document client trop volumineux." };
  }
  let document: unknown;
  try {
    document = JSON.parse(body);
  } catch {
    return { ok: false, reason: "Document client illisible." };
  }
  const metadata = parseClientMetadata(document, clientId);
  if (!metadata) return { ok: false, reason: "Document client invalide." };
  return { ok: true, metadata };
}
