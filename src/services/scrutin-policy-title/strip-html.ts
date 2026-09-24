const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ecirc: "ê",
  ocirc: "ô",
  ugrave: "ù",
  ccedil: "ç",
  icirc: "î",
  euro: "€",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m);
}

/**
 * Converts AN amendment HTML (dispositif / exposé sommaire) to plain text.
 * Block-level tag boundaries become spaces (so paragraphs don't concatenate),
 * remaining tags are stripped, entities (hex/decimal/named) decoded, whitespace
 * collapsed. AN HTML is simple markup, so no DOM parser is needed.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  let text = html.replace(/<\/(p|div|li|tr|h[1-6]|br|ul|ol|blockquote)\s*>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, " ");
  text = text.replace(/<[^>]+>/g, "");
  // Before decoding, not after: an unterminated `<` left by the strip has to go, while a `&lt;`
  // that the AN text genuinely meant, as in "seuil &lt; 5 %", still becomes a `<` below.
  text = text.replace(/[<>]/g, "");
  text = decodeEntities(text);
  text = text.replace(/\s+/g, " ").trim();
  return text;
}
