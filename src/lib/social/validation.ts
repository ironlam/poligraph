import { RichText } from "@atproto/api";

export const BLUESKY_MAX_GRAPHEMES = 300;
const DEFAULT_X_MAX_CHARS = 280;

/**
 * X bills a post with a link at $0.20 instead of $0.015, and it auto-links bare domains as well as
 * full URLs ("poligraph.fr" counts). The link stays in the bio; a post that really needs one says so.
 */
const X_LINK_PATTERN =
  /(https?:\/\/\S+)|(\bwww\.\S+)|(\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:fr|com|org|net|eu|io|app|info|gouv|social|co|tv|me|ly)\b)/i;

/** X weighs emoji and wide characters as two; everything else counts one per code point. */
const DOUBLE_WEIGHT_PATTERN = /[\p{Extended_Pictographic}ᄀ-ᅟ⺀-꓏가-힣]/u;

export function getXMaxChars(): number {
  const configured = Number(process.env.SOCIAL_X_MAX_CHARS);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return DEFAULT_X_MAX_CHARS;
}

export function xWeightedLength(text: string): number {
  let length = 0;
  for (const char of text) {
    length += DOUBLE_WEIGHT_PATTERN.test(char) ? 2 : 1;
  }
  return length;
}

export function blueskyLength(text: string): number {
  return new RichText({ text }).graphemeLength;
}

/** Returns the reasons a text cannot go to Bluesky; empty when it can. */
export function validateBlueskyText(text: string): string[] {
  const problems: string[] = [];
  if (text.trim().length === 0) problems.push("Texte Bluesky vide.");
  const length = blueskyLength(text);
  if (length > BLUESKY_MAX_GRAPHEMES) {
    problems.push(`Texte Bluesky trop long : ${length} caractères sur ${BLUESKY_MAX_GRAPHEMES}.`);
  }
  return problems;
}

/** Returns the reasons a text cannot go to X; empty when it can. */
export function validateXText(text: string, options: { allowLink?: boolean } = {}): string[] {
  const problems: string[] = [];
  if (text.trim().length === 0) problems.push("Texte X vide.");
  const max = getXMaxChars();
  const length = xWeightedLength(text);
  if (length > max) problems.push(`Texte X trop long : ${length} caractères sur ${max}.`);
  const link = text.match(X_LINK_PATTERN);
  if (link && !options.allowLink) {
    problems.push(
      `Lien détecté dans le texte X (« ${link[0]} ») : un post avec lien coûte 0,20 $ au lieu de 0,015 $. Retirer le lien, ou passer autoriserLienX à true.`
    );
  }
  return problems;
}
