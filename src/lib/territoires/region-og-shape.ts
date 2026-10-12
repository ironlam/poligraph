import { FRANCE_DROM_INSETS, FRANCE_OUTLINE, REGION_OUTLINES } from "@/config/territoires-shapes";

/**
 * Metropolitan France with the five DROM insets below it, as on the entry page map: the card
 * for the whole section shows every region, overseas included.
 */
export function franceOutlineDataUri(): string {
  const departments = Object.values(FRANCE_OUTLINE.departments)
    .map(
      (d) =>
        `<path d="${d}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"/>`
    )
    .join("");
  const insets = FRANCE_DROM_INSETS.boxes
    .map(
      ({ box: [x, y, w, h], d }) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="#ffffff" stroke-opacity="0.25"/>` +
        `<path d="${d}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FRANCE_DROM_INSETS.viewBox}" fill-rule="evenodd" stroke-linejoin="round">${departments}${insets}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * The region outline as an SVG data URI, departments drawn as hairlines. Null when no outline
 * exists (unknown name): the card then carries no shape rather than another territory's.
 */
export function regionOutlineDataUri(regionName: string): string | null {
  const outline = REGION_OUTLINES[regionName];
  if (!outline) return null;
  const paths = Object.values(outline.departments)
    .map(
      (d) =>
        `<path d="${d}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.2"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${outline.viewBox}" fill-rule="evenodd" stroke-linejoin="round">${paths}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
