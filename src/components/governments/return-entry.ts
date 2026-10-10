// Contextual return from a profile to the « Gouvernements » page it was opened from (spec §6.5).
// Pure helpers, no directive. Storage is optional: every access is guarded, and without it the
// profile simply shows no return link.

export const RETURN_STORAGE_KEY = "poligraph:gouvernements:retour";
export const RETURN_MAX_AGE_MS = 30 * 60 * 1000;

export type ReturnEntry = {
  targetSlug: string;
  returnUrl: string;
  label: string;
  scrollY: number;
  createdAt: number;
};

/** Relative URL inside the section only: no scheme, no protocol-relative `//`, no backslash. */
export function isAllowedReturnUrl(url: string): boolean {
  if (url.includes("\\")) return false;
  return /^\/politiques\/gouvernements(?:[/?#]|$)/.test(url) && !url.startsWith("//");
}

function isEntry(value: unknown): value is ReturnEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.targetSlug === "string" &&
    typeof v.returnUrl === "string" &&
    typeof v.label === "string" &&
    typeof v.scrollY === "number" &&
    Number.isFinite(v.scrollY) &&
    typeof v.createdAt === "number"
  );
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Raw entry, validated for shape and URL, or null. Never throws. */
export function readReturnEntry(): ReturnEntry | null {
  try {
    const raw = storage()?.getItem(RETURN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEntry(parsed) || !isAllowedReturnUrl(parsed.returnUrl)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Entry usable on the profile `slug` at time `now`, or null. */
export function returnEntryFor(slug: string, now: number = Date.now()): ReturnEntry | null {
  const entry = readReturnEntry();
  if (!entry || entry.targetSlug !== slug) return null;
  const age = now - entry.createdAt;
  if (age < 0 || age > RETURN_MAX_AGE_MS) return null;
  return entry;
}

export function writeReturnEntry(entry: ReturnEntry): void {
  if (!isAllowedReturnUrl(entry.returnUrl)) return;
  try {
    storage()?.setItem(RETURN_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage blocked or full: the return link is an optional convenience.
  }
}

export function clearReturnEntry(): void {
  try {
    storage()?.removeItem(RETURN_STORAGE_KEY);
  } catch {
    // Same as above.
  }
}
