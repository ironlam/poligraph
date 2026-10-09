import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { identifyPhoto } from "@/lib/photos/source-photo";

/**
 * Download a photo from a URL typed by an administrator, server side.
 *
 * Any public host is allowed on purpose: pasting a town hall's URL and copying
 * it to Blob is the documented way to give a mayor a photo. What is refused is
 * a request to our own infrastructure (SSRF): plain HTTP, loopback, private and
 * link-local ranges, including after a redirect.
 *
 * Residual risk: the host is resolved here and again by `fetch`, so a hostile
 * DNS server could answer differently the second time (DNS rebinding). The
 * route is behind admin authentication, which bounds who could try.
 */

export type PublicPhotoFetch =
  | { kind: "photo"; buffer: Buffer; contentType: string }
  /** Downloaded fine, but the bytes are a placeholder or a web page. */
  | { kind: "not-a-photo" }
  /** The URL points somewhere a server must not call. */
  | { kind: "forbidden"; reason: string }
  /** Error status or network failure. */
  | { kind: "unreachable" };

const MAX_REDIRECTS = 3;
/** Above this, the body is not read: a portrait never weighs this much. */
export const MAX_PHOTO_DOWNLOAD_BYTES = 15 * 1024 * 1024;

/** Read a body up to `limit` bytes; null when it is larger. */
async function readCapped(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) return null;
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
const TIMEOUT_MS = 10_000;

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

const PRIVATE_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

/**
 * The IPv4 embedded in an IPv4-mapped (`::ffff:a.b.c.d`) or IPv4-compatible (`::a.b.c.d`) IPv6
 * address, in dotted or hexadecimal form. `new URL()` canonicalises `[::ffff:127.0.0.1]` to
 * `::ffff:7f00:1`, which a dotted-only pattern lets through.
 */
function embeddedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;
  const hex = lower.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1]!, 16);
  const low = parseInt(hex[2]!, 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function isPublicAddress(ip: string): boolean {
  const embedded = embeddedIpv4(ip);
  if (embedded) return isPublicAddress(embedded);

  if (isIP(ip) === 4) {
    const n = ipv4ToNumber(ip);
    return !PRIVATE_IPV4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) >>> 0 === (ipv4ToNumber(base) & mask) >>> 0;
    });
  }

  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    // fc00::/7 (unique local) and fe80::/10 (link local).
    return !/^f[cd]/.test(lower) && !/^fe[89ab]/.test(lower);
  }

  return false;
}

async function checkUrl(raw: string): Promise<URL | { reason: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { reason: "adresse invalide" };
  }
  if (url.protocol !== "https:") return { reason: "seules les adresses https sont acceptées" };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: Array<{ address: string }>;
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    return { reason: "hôte introuvable" };
  }
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    return { reason: "l'hôte pointe vers une adresse interne" };
  }
  return url;
}

export async function fetchPublicPhoto(raw: string): Promise<PublicPhotoFetch> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = await checkUrl(current);
    if (!(checked instanceof URL)) return { kind: "forbidden", reason: checked.reason };

    let response: Response;
    try {
      response = await fetch(checked, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { kind: "unreachable" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { kind: "unreachable" };
      current = new URL(location, checked).toString();
      continue;
    }
    // Only a 200 with a body says anything about the photo: a firewall
    // challenge (the European Parliament answers 202, empty) is not a fake one.
    if (response.status !== 200) return { kind: "unreachable" };

    let buffer: Buffer | null;
    try {
      buffer = await readCapped(response, MAX_PHOTO_DOWNLOAD_BYTES);
    } catch {
      return { kind: "unreachable" };
    }
    if (!buffer || buffer.length === 0) return { kind: "unreachable" };
    const photo = identifyPhoto(buffer);
    return photo
      ? { kind: "photo", buffer, contentType: photo.contentType }
      : { kind: "not-a-photo" };
  }
  return { kind: "unreachable" };
}
