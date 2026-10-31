export const EXCERPT_MIN_LENGTH = 100;
export const EXCERPT_MAX_LENGTH = 520;

/** Source kinds that are a written document whose passage can be quoted. Speeches, press and video link out only. */
export const EXCERPT_SOURCE_KINDS = [
  "PROGRAMME_PARTI",
  "PROGRAMME_CANDIDAT",
  "PROPOSITIONS_CANDIDAT",
] as const;

/** Pure checks on the text itself. That it appears word for word in the document is checked by the caller, which holds the document. */
export function validateExcerpt(raw: string): { excerpt: string; errors: string[] } {
  const excerpt = raw.replace(/\s+/g, " ").trim();
  const errors: string[] = [];
  if (excerpt.length < EXCERPT_MIN_LENGTH) {
    errors.push(`Extrait trop court (${excerpt.length} caractères, minimum ${EXCERPT_MIN_LENGTH})`);
  }
  if (excerpt.length > EXCERPT_MAX_LENGTH) {
    errors.push(`Extrait trop long (${excerpt.length} caractères, maximum ${EXCERPT_MAX_LENGTH})`);
  }
  if (/[<>{}]|https?:\/\//.test(excerpt)) {
    errors.push(
      "Extrait avec des balises, des accolades ou un lien : ce n'est pas du texte de document"
    );
  }
  if (/(note de l'éditeur|\bnb\s*:|\bndlr\b|à vérifier|\btodo\b)/i.test(excerpt)) {
    errors.push("Extrait contenant une note qui n'est pas du document");
  }
  if (!/[.!?»”)…]$/.test(excerpt)) {
    errors.push("Extrait qui ne se termine pas à la fin d'une phrase");
  }
  return { excerpt, errors };
}
