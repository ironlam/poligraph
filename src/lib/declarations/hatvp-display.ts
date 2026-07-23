import type { AnnualRevenue } from "@/types/hatvp";

const REDACTED = /\[Données non publiées\]/gi;
const EMPTY_PLACEHOLDERS = new Set(["néant", "neant", "sans objet", "n/a", "na", ""]);

// Replace HATVP redaction markers wherever they appear (literal tokens, safe mid-string).
export function cleanRedactions(text: string): string {
  return text.replace(REDACTED, "(non publié)");
}

// True only when the ENTIRE value is an empty/absent placeholder. Never matches
// a "néant" occurring inside a real sentence.
export function isEmptyPlaceholder(text: string | null | undefined): boolean {
  if (text == null) return true;
  return EMPTY_PLACEHOLDERS.has(text.trim().toLowerCase());
}

export function displayHatvpText(text: string | null | undefined): string | null {
  if (isEmptyPlaceholder(text)) return null;
  return cleanRedactions(text as string);
}

// Exact euro formatting for detail lines: "0 €" for a real zero (never "—").
export function formatEuroExact(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(value)} €`;
}

export function sortRevenuesAsc(rev: AnnualRevenue[]): AnnualRevenue[] {
  return [...rev].sort((a, b) => a.year - b.year);
}

// Sum of the amounts actually declared; absent years are never treated as zero.
export function sumRevenues(rev: AnnualRevenue[]): number {
  return rev.reduce((sum, r) => sum + r.amount, 0);
}

export function coveredPeriod(rev: AnnualRevenue[]): { from: number; to: number } | null {
  if (rev.length === 0) return null;
  const years = rev.map((r) => r.year);
  return { from: Math.min(...years), to: Math.max(...years) };
}
