/**
 * Host checks on URLs, replacing `url.includes("example.com")`.
 *
 * A substring test answers true for `https://evil.com/?ref=example.com` and for
 * `https://example.com.evil.com/`, because the string appears in the path, the query or a
 * longer hostname. Reading `URL.hostname` compares the host the browser or the client would
 * actually contact.
 */

/**
 * True when `url` points at `host` or one of its subdomains.
 *
 * The leading dot in the suffix test is what separates `fr.wikipedia.org` (a subdomain) from
 * `notwikipedia.org` (a different site that merely ends with the same letters).
 *
 * Anything that does not parse as a URL answers false: callers use this to recognise a known
 * host, never to reject one, so an unparseable input is simply not that host.
 */
export function matchesHost(url: string, host: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return hostname === host || hostname.endsWith(`.${host}`);
}
