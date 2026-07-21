const STOPWORDS = new Set(
  (
    "de la le les des du un une et a a au aux en pour par dans sur the of d l " +
    "contre visant relatif relative projet proposition loi resolution afin ainsi " +
    "que qui se sa son ses leur leurs plus fin premiere lecture nouvelle deuxieme " +
    "texte adopte adoptee assemblee nationale senat tous toutes tout toute"
  ).split(" ")
);

/** Lowercase, strip accents, replace non-alphanumerics with spaces, collapse. */
export function normalizeTitle(s: string): string {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#?\w+;/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Salient tokens: normalized, length > 2, stopwords removed. */
export function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalizeTitle(s).split(" ")) {
    if (w.length > 2 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/** The bill phrase in a scrutin title: text after "(proposition|projet) de loi",
 *  trailing "(...lecture)" and final period removed. null if not present. */
export function billPhrase(title: string): string | null {
  const m = (title || "").match(
    /(?:proposition de loi|projet de loi|proposition de r[eé]solution)\s+(.+)$/i
  );
  if (!m) return null;
  // The regex has exactly one capture group, matched whenever `m` is non-null.
  const captured = m[1];
  if (captured === undefined) return null;
  return captured
    .replace(/\s*\([^)]*lecture[^)]*\)\s*\.?\s*$/i, "")
    .replace(/\s*\.\s*$/, "")
    .trim();
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
