import { createWriteStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

const MAX_BYTES = 128 * 1024 * 1024;
/** Stream the official archive, with conditional HTTP, bounded redirects/size and
 * a whole-request deadline. Never accept an HTML error page as a ZIP.
 */
export async function downloadDebateArchive(
  url: string,
  dest: string,
  etag?: string | null,
  redirects = 0
): Promise<{ notModified: boolean; etag: string | null }> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "data.assemblee-nationale.fr" || redirects > 3) {
    throw new Error("Unexpected debate archive redirect");
  }
  const response = await fetch(u, {
    headers: etag ? { "If-None-Match": etag } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status === 304) return { notModified: true, etag: etag ?? null };
  if ([301, 302, 307, 308].includes(response.status)) {
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect without location");
    return downloadDebateArchive(new URL(location, u).href, dest, etag, redirects + 1);
  }
  if (!response.ok || response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error(`Debate archive HTTP ${response.status}`);
  }
  const expected = Number(response.headers.get("content-length") ?? 0);
  if (expected > MAX_BYTES || /text\/html/i.test(response.headers.get("content-type") ?? "")) {
    await response.body.cancel();
    throw new Error("Invalid debate archive response");
  }
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body as ReadableStream),
    async function* (source) {
      for await (const chunk of source) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) throw new Error("Debate archive too large");
        yield chunk;
      }
    },
    createWriteStream(dest)
  );
  if (expected > 0 && statSync(dest).size !== expected)
    throw new Error("Incomplete debate archive");
  return { notModified: false, etag: response.headers.get("etag") };
}
