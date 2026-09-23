import { matchesHost } from "@/lib/url-host";

/**
 * Extract publication date from a news article URL.
 *
 * Many French news sites embed the publication date in the URL path.
 * This is more reliable than scraping HTML meta tags, since URL slugs
 * are immutable once published.
 *
 * Supported patterns:
 *  - /article/YYYY/MM/DD/  (lemonde, huffpost)
 *  - /YYYY/MM/DD/          (huffpost, various)
 *  - -YYYYMMDD_ or -YYYYMMDD-  (liberation, france24)
 *  - DD-MM-YYYY-           (leparisien)
 *  - /DDMMYY/              (mediapart old)
 */
export function extractDateFromUrl(url: string): Date | null {
  // Skip Wikipedia URLs. On the host, not on the string: a press URL citing wikipedia.org in a
  // query parameter was skipped too, and the caller then fell back to today instead of the
  // publication date.
  if (matchesHost(url, "wikipedia.org")) return null;

  // Pattern: /article/YYYY/MM/DD/ (lemonde, huffpost)
  let match = url.match(/\/article\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}`);

  // Pattern: /YYYY/MM/DD/ (huffpost, various)
  match = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (match) {
    const y = parseInt(match[1]!);
    if (y >= 2000 && y <= 2030) return new Date(`${match[1]}-${match[2]}-${match[3]}`);
  }

  // Pattern: -YYYYMMDD_ or -YYYYMMDD- (liberation, france24)
  match = url.match(/[-/](\d{4})(\d{2})(\d{2})[_\-/.]/);
  if (match) {
    const y = parseInt(match[1]!);
    if (y >= 2000 && y <= 2030) return new Date(`${match[1]}-${match[2]}-${match[3]}`);
  }

  // Pattern: DD-MM-YYYY- (leparisien)
  match = url.match(/(\d{2})-(\d{2})-(\d{4})-/);
  if (match) {
    const y = parseInt(match[3]!);
    if (y >= 2000 && y <= 2030) return new Date(`${match[3]}-${match[2]}-${match[1]}`);
  }

  // Pattern: /DDMMYY/ (mediapart old)
  match = url.match(/\/(\d{2})(\d{2})(\d{2})\//);
  if (match) {
    const y = parseInt(match[3]!);
    if (y >= 0 && y <= 30) {
      const fullYear = 2000 + y;
      return new Date(`${fullYear}-${match[2]}-${match[1]}`);
    }
  }

  return null;
}
