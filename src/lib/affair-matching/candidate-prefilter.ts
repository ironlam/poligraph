import type { AffairCandidateRecord } from "./signals/types";
import { normalizeForMatching } from "./normalize";

/** @deprecated Importer `normalizeForMatching` depuis ./normalize. Conservé pour les appelants existants. */
export const normalizeText = normalizeForMatching;

/**
 * Drops an English possessive so « Marine Le Pen's appeal » still yields the key
 * "le pen". The corpus carries English-language coverage of French politics, and
 * the suffix rode along with the token, turning the surname into "le pen's".
 */
function stripPossessive(token: string): string {
  return token.replace(/'s$/, "");
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
  const tokens = matches.map((m) => stripPossessive(normalizeText(m.trim())));

  const runs = text.match(/(?:[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\-']*)(?:\s+[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\-']*)+/g) ?? [];
  for (const run of runs) {
    const words = run.split(/\s+/);
    for (let i = 0; i + 1 < words.length; i++) {
      tokens.push(stripPossessive(normalizeText(`${words[i]} ${words[i + 1]}`)));
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
