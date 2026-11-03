// Chaîne YouTube de Poligraph et vidéos rattachées aux pages du site.
// Ajouter une vidéo = une ligne ici, puis un déploiement (pas de champ en base pour l'instant).

export const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@poligraph_fr";

/** Un identifiant de vidéo YouTube : 11 caractères, jamais une URL libre. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Slug du scrutin -> identifiant de la vidéo qui l'explique. */
export const SCRUTIN_VIDEOS: Readonly<Record<string, string>> = {
  // Amendement n° 1358 de M. Lhardit (taxe au gigaoctet), adopté 11 voix contre 10.
  "2026-10-30-l-amendement-n-1358-de-m-lhardit-apres-l-article-15-examen-prioritair": "0D3Oys-MlEs",
};

export function getScrutinVideoId(slug: string | null | undefined): string | null {
  if (!slug || !Object.hasOwn(SCRUTIN_VIDEOS, slug)) return null;
  return SCRUTIN_VIDEOS[slug] ?? null;
}
