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

export function isPublicAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]!);

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
    if (!response.ok) return { kind: "unreachable" };

    const buffer = Buffer.from(await response.arrayBuffer());
    const photo = identifyPhoto(buffer);
    return photo
      ? { kind: "photo", buffer, contentType: photo.contentType }
      : { kind: "not-a-photo" };
  }
  return { kind: "unreachable" };
}
