import { USER_AGENT } from "@/config/site";

/**
 * Fetching and decoding the election result files published on data.gouv.fr.
 *
 * The municipales importers each carried their own copy of these two functions, byte for byte.
 * They are here so a fix to the encoding or the transport lands once.
 */

/**
 * Download a URL and return the body as a Buffer.
 *
 * Throws on a non-2xx response: an importer that silently parses an error page produces plausible
 * garbage, which is worse than a stack trace in a nightly job.
 */
export async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Decode a Latin-1 buffer, drop the header line, split what is left on `delimiter`.
 *
 * The Ministry of the Interior publishes these files in Latin-1, not UTF-8. Reading them as
 * UTF-8 mangles every accented commune name, and the damage is silent.
 */
export function decodeAndSplit(buffer: Buffer, delimiter: string): string[][] {
  return buffer
    .toString("latin1")
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(delimiter));
}

/** Parse an integer that may be blank or contain thin spaces as thousands separators. */
export function parseIntSafe(value: string): number {
  if (!value || value.trim() === "") return 0;
  return parseInt(value.replace(/\s/g, ""), 10) || 0;
}
