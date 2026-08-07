import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Clean affair title for slug generation:
 * - Strip "À vérifier — " / "À vérifier - " prefix
 * - Strip "Affaire de/des/du/de la/de l'" prefix
 */
export function cleanAffairTitle(title: string): string {
  return title
    .replace(/^\[?[AÀ]\s*V[ÉEée]RIFIER\]?\s*[—–-]?\s*/i, "")
    .replace(/^Affaire\s+de\s+l['']/i, "")
    .replace(/^Affaire\s+de\s+la\s+/i, "")
    .replace(/^Affaire\s+des?\s+/i, "")
    .replace(/^Affaire\s+du\s+/i, "")
    .replace(/^Affaire\s+/i, "")
    .trim();
}

/**
 * Generate an affair slug with politician name prefix.
 * Example: "eric-zemmour-propos-trafiquants-crack-senegalais"
 */
export function generateAffairSlug(politicianSlug: string, title: string): string {
  const cleanTitle = cleanAffairTitle(title);
  return generateSlug(`${politicianSlug} ${cleanTitle}`);
}

/**
 * Strip markdown syntax for plain-text display in listing/SEO contexts.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** → bold
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1") // *italic* → italic
    .replace(/_([^_]+)_/g, "$1");
}

/**
 * French percentage: comma as the decimal separator and a NON-BREAKING space before the sign, so the
 * "%" never wraps to its own line.
 *
 * The space is a literal U+00A0 and not an escape, because two copies of this function previously
 * documented a non-breaking space while typing an ordinary one, and nothing caught it: the only state
 * that rendered a percentage was never rendered in a test.
 */
export function formatPct(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals).replace(".", ",")} %`;
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

/**
 * Format a date-only string (YYYY-MM-DD) in French, using UTC to avoid timezone shifts.
 */
export function formatDateFrUTC(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format a Date to YYYY-MM-DD for HTML date inputs.
 */
export function formatDateForInput(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0]!;
}

export function formatDateShort(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

/**
 * Normalize an image URL to use HTTPS.
 * Fixes Mixed Content warnings from legacy photo URLs stored with http://.
 */
export function normalizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

export function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCompactCurrency(value: number | null): string {
  if (value === null || value === 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M€`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k€`;
  return `${value} €`;
}

/**
 * Generate a SEO-friendly slug with date prefix
 * Format: YYYY-MM-DD-titre-slugifie (max 120 characters)
 *
 * Truncates at a word boundary (last `-` before the limit) to avoid
 * cutting in the middle of a word.
 *
 * @param date - The date to prefix the slug with (uses current date if null)
 * @param title - The title to slugify
 * @param maxLength - Maximum total length of the slug (default: 120)
 * @returns A slugified string in format "YYYY-MM-DD-title-slug"
 */
/**
 * Generate a unique slug by appending a counter suffix if the base slug is already taken.
 *
 * @param baseSlug - The desired slug (already slugified)
 * @param exists - Async predicate returning true if the slug is already in use
 * @param maxLength - Maximum slug length before truncating (default: 80)
 * @returns A unique slug guaranteed not to exist according to the `exists` predicate
 */
export async function generateUniqueSlug(
  baseSlug: string,
  exists: (slug: string) => Promise<boolean>,
  maxLength: number = 80
): Promise<string> {
  let slug = baseSlug;
  if (!(await exists(slug))) return slug;

  let counter = 2;
  while (counter <= 100) {
    const suffix = `-${counter}`;
    const truncatedBase = baseSlug.slice(0, maxLength - suffix.length).replace(/-$/, "");
    slug = `${truncatedBase}${suffix}`;
    if (!(await exists(slug))) return slug;
    counter++;
  }

  return `${baseSlug.slice(0, 60)}-${Date.now()}`;
}

export function generateDateSlug(
  date: Date | null,
  title: string,
  maxLength: number = 120
): string {
  const datePrefix = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const titleSlug = generateSlug(title);

  // 10 chars for date (YYYY-MM-DD) + 1 for dash
  const availableLength = maxLength - datePrefix!.length - 1;

  let truncatedTitle = titleSlug;
  if (titleSlug.length > availableLength) {
    // Truncate at last word boundary (last dash before limit)
    truncatedTitle = titleSlug.slice(0, availableLength);
    const lastDash = truncatedTitle.lastIndexOf("-");
    if (lastDash > 0) {
      truncatedTitle = truncatedTitle.slice(0, lastDash);
    }
  }

  return `${datePrefix}-${truncatedTitle}`;
}
