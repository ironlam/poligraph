const VERIFIED_AFFAIR_PRESS_HOSTS = new Set([
  "lemonde.fr",
  "mediapart.fr",
  "afp.com",
  "lefigaro.fr",
  "liberation.fr",
  "francetvinfo.fr",
  "reuters.com",
  "apnews.com",
]);

/** Sources journalistiques admises pour ajouter un fait judiciaire à une fiche. */
export function isVerifiedAffairPressUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return [...VERIFIED_AFFAIR_PRESS_HOSTS].some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

export interface AffairPressEventSource {
  url: string;
  title: string;
  publisher: string;
  publishedAt: Date | null;
  excerpt?: string | null;
}

/** Selects only provenance complete enough for a HIGH-risk public timeline proposal. */
export function findVerifiedAffairPressEventSource<T extends AffairPressEventSource>(
  sources: readonly T[]
): T | null {
  return (
    sources.find(
      (source) =>
        isVerifiedAffairPressUrl(source.url) &&
        source.publishedAt instanceof Date &&
        !Number.isNaN(source.publishedAt.getTime()) &&
        source.title.trim().length > 0 &&
        source.publisher.trim().length > 0 &&
        Boolean(source.excerpt?.trim()) &&
        source.excerpt!.trim().length <= 500
    ) ?? null
  );
}
