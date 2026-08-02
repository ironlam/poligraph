import type { AffairCandidateRecord } from "./signals/types";

/**
 * Normalizes text by lowercasing, stripping accents, and normalizing dashes.
 * Shared with the identity resolver's `normalizeText` in `src/lib/name-matching.ts`
 * but kept local here to avoid importing server-only modules into signals.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[-–—]/g, " ")
    .trim();
}

/**
 * Extracts potential surname tokens from free text. A surname candidate is
 * a capitalized word (or hyphenated compound) of at least 4 characters.
 * Returns normalized tokens for use as blocking keys.
 * Note: word boundaries (\b) don't work reliably with accented characters,
 * so we use a lookahead/lookbehind approach instead.
 *
 * Pairs of adjacent capitalized words are emitted too, because a compound
 * surname is indexed under its whole normalized form. Without them the four
 * character floor made « Le Pen » unreachable: "Le" is two characters, "Pen" is
 * three, and no single token ever spells the key "le pen". The most covered
 * conviction of the corpus proposed Benoît Mariné, on the first name « Marine »,
 * and never Marine Le Pen. Measured cost of the pairs: 0.2 extra candidates per
 * text, since a pair only matches when the compound surname appears verbatim.
 */
export function extractSurnameCandidates(text: string): string[] {
  const matches = text.match(/(?:^|\s)[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\-']{3,}(?=\s|$|[^\w\-'])/g) ?? [];
  const tokens = matches.map((m) => normalizeText(m.trim()));

  const runs = text.match(/(?:[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\-']*)(?:\s+[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\-']*)+/g) ?? [];
  for (const run of runs) {
    const words = run.split(/\s+/);
    for (let i = 0; i + 1 < words.length; i++) {
      tokens.push(normalizeText(`${words[i]} ${words[i + 1]}`));
    }
  }

  return tokens;
}

/**
 * Fast in-memory politician lookup by normalized last name. Mirrors the
 * blocking pattern in `src/lib/identity/resolver.ts::resolveBatch` where the
 * politician map is built once and reused across all inputs in a batch.
 */
export class CandidatePrefilter {
  private byLastName: Map<string, AffairCandidateRecord[]> = new Map();

  constructor(pool: AffairCandidateRecord[]) {
    for (const p of pool) {
      // Index by the full normalized last name.
      this.add(p.normalizedLastName, p);
      // Index by the primary surname component (last word of compound names).
      const parts = p.normalizedLastName.split(/\s+/);
      const primary = parts[parts.length - 1];
      if (primary && primary !== p.normalizedLastName) {
        this.add(primary, p);
      }
    }
  }

  private add(key: string, p: AffairCandidateRecord) {
    const list = this.byLastName.get(key) ?? [];
    if (!list.includes(p)) list.push(p);
    this.byLastName.set(key, list);
  }

  filter(text: string): AffairCandidateRecord[] {
    const tokens = extractSurnameCandidates(text);
    const seen = new Set<string>();
    const result: AffairCandidateRecord[] = [];

    for (const token of tokens) {
      const matches = this.byLastName.get(token);
      if (matches) {
        for (const p of matches) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            result.push(p);
          }
        }
      }
    }
    return result;
  }
}
