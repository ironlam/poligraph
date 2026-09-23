/**
 * Host checks on URLs, replacing `url.includes("example.com")`.
 *
 * A substring test answers true for `https://evil.com/?ref=example.com` and for
 * `https://example.com.evil.com/`, because the string appears in the path, the query or a
 * longer hostname. Reading `URL.hostname` compares the host the browser or the client would
 * actually contact.
 */

/** Drop the trailing dot of a fully qualified name, which `URL.hostname` preserves. */
function withoutRootDot(host: string): string {
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

/**
 * True when `url` points at `host` or one of its subdomains.
 *
 * The leading dot in the suffix test is what separates `fr.wikipedia.org` (a subdomain) from
 * `notwikipedia.org` (a different site that merely ends with the same letters).
 *
 * Both names are normalised first, because `https://fr.wikipedia.org./` is a legal spelling that
 * reaches Wikipedia and whose hostname keeps its root dot. Dropping it only removes false
 * negatives: `evil.com.` still does not become `wikipedia.org`.
 *
 * Anything that does not parse as a URL answers false: callers use this to recognise a known
 * host, never to reject one, so an unparseable input is simply not that host.
 */
export function matchesHost(url: string, host: string): boolean {
  let hostname: string;
  try {
    hostname = withoutRootDot(new URL(url).hostname);
  } catch {
    return false;
  }
  const expected = withoutRootDot(host);
  return hostname === expected || hostname.endsWith(`.${expected}`);
}
