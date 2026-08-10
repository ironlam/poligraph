import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "PoligraphProgramImporter/1.0 (+https://poligraph.fr)";

export type AcquiredDocument = {
  bytes: Buffer;
  contentType: string;
  hash: string;
  fromCache: boolean;
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchWithRetry(url: string, timeoutMs: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
}): Promise<AcquiredDocument> {
  const cacheDir = input.cacheDir ?? ".tmp/program-import";
  const metadataPath = path.join(cacheDir, `${input.id}.json`);
  if (!input.forceRefetch) {
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        hash: string;
        contentType: string;
      };
      const bytes = await readFile(path.join(cacheDir, metadata.hash));
      return { bytes, ...metadata, fromCache: true };
    } catch {
      // A partial or missing cache is equivalent to a cache miss.
    }
  }

  const response = await fetchWithRetry(input.url, input.timeoutMs ?? 20_000);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Document vide");
  const hash = sha256(bytes);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, hash), bytes);
  await writeFile(metadataPath, JSON.stringify({ hash, contentType }, null, 2));
  return { bytes, hash, contentType, fromCache: false };
}
