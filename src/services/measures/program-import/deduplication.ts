export function normalizeForDeduplication(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function jaccardSimilarity(left: string, right: string): number {
  const a = new Set(normalizeForDeduplication(left).split(" ").filter(Boolean));
  const b = new Set(normalizeForDeduplication(right).split(" ").filter(Boolean));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
