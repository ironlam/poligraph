import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "PoligraphProgramImporter/1.0 (+https://poligraph.fr)";
const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type CacheMetadata = {
  hash: string;
  contentType: string;
  url: string;
  fetchedAt: string;
  etag: string | null;
  lastModified: string | null;
};

export type AcquiredDocument = {
  bytes: Buffer;
  contentType: string;
  hash: string;
  fromCache: boolean;
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  conditionalHeaders: Record<string, string> = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...conditionalHeaders },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok && response.status !== 304) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Échec du téléchargement");
}

export async function acquireDocument(input: {
  id: string;
  url: string;
  cacheDir?: string;
  forceRefetch?: boolean;
  timeoutMs?: number;
  cacheMaxAgeMs?: number;
}): Promise<AcquiredDocument> {
  const cacheDir = input.cacheDir ?? ".tmp/program-import";
  const metadataPath = path.join(cacheDir, `${input.id}.json`);
  let cached: { metadata: CacheMetadata; bytes: Buffer } | null = null;
  if (!input.forceRefetch) {
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as CacheMetadata;
      const bytes = await readFile(path.join(cacheDir, metadata.hash));
      if (metadata.url === input.url && Number.isFinite(Date.parse(metadata.fetchedAt))) {
        cached = { metadata, bytes };
        const age = Date.now() - Date.parse(metadata.fetchedAt);
        if (age <= (input.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS)) {
          return {
            bytes,
            hash: metadata.hash,
            contentType: metadata.contentType,
            fromCache: true,
          };
        }
      }
    } catch {
      // A partial or missing cache is equivalent to a cache miss.
    }
  }

  const conditionalHeaders: Record<string, string> = {};
  if (cached?.metadata.etag) conditionalHeaders["If-None-Match"] = cached.metadata.etag;
  if (cached?.metadata.lastModified) {
    conditionalHeaders["If-Modified-Since"] = cached.metadata.lastModified;
  }
  const response = await fetchWithRetry(input.url, input.timeoutMs ?? 20_000, conditionalHeaders);
  if (response.status === 304 && cached) {
    const metadata = { ...cached.metadata, fetchedAt: new Date().toISOString() };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    return {
      bytes: cached.bytes,
      hash: metadata.hash,
      contentType: metadata.contentType,
      fromCache: true,
    };
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Document vide");
  const hash = sha256(bytes);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  const metadata: CacheMetadata = {
    hash,
    contentType,
    url: input.url,
    fetchedAt: new Date().toISOString(),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, hash), bytes);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  return { bytes, hash, contentType, fromCache: false };
}
