// Pure, dependency-free name matching for the municipales mayor reconciliation.
// Extracted from reconcile-municipales-2026-mayors.ts (which imports @/lib/db)
// so unit tests can import it without a DATABASE_URL.

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// True if two name fields (both first names, or both last names) refer to the
// same name. Primary path: overlap on >=3-char normalized tokens, which stays
// robust to compound first names ("Jean Christophe" vs "Christophe"). Fallback,
// taken when at least one side yields no >=3-char token (short surnames such as
// "Pi"): whole-word equality/inclusion on the full normalized strings, so
// "Pi" == "PI" matches while "Li" is not swallowed by "Slimani".
function nameFieldMatches(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  const ta = na.split(" ").filter((t) => t.length >= 3);
  const tb = nb.split(" ").filter((t) => t.length >= 3);
  if (ta.length > 0 && tb.length > 0) {
    const setB = new Set(tb);
    return ta.some((t) => setB.has(t));
  }
  const pa = ` ${na} `;
  const pb = ` ${nb} `;
  return na === nb || pa.includes(pb) || pb.includes(pa);
}

// Name guard for Phase 3's link-to-existing paths. An existing politician may
// only inherit a 2026 winner's MAIRE mandate when BOTH first and last name
// match. Without a birthdate the identity resolver over-matches on
// surname+department, so this blocks false links such as winner "Michael Rimane"
// attaching to deputy "Davy Rimane". Prefers the winner's structured first/last
// name and falls back to the full candidateName when either is missing.
export function nameMatchesWinner(
  polFirst: string | null,
  polLast: string | null,
  winnerFirst: string | null,
  winnerLast: string | null,
  winnerName: string | null
): boolean {
  const pf = polFirst ?? "";
  const pl = polLast ?? "";
  if (winnerFirst && winnerLast) {
    return nameFieldMatches(pf, winnerFirst) && nameFieldMatches(pl, winnerLast);
  }
  const wn = winnerName ?? "";
  if (!wn) return false;
  return nameFieldMatches(pf, wn) && nameFieldMatches(pl, wn);
}
