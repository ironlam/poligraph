const MAX_PATH_LENGTH = 300;

/**
 * Chemin de la page d'où vient un retour. Ne garde que le chemin : pas d'URL absolue (le champ
 * s'affiche dans l'admin, il ne doit pas devenir un lien sortant), pas de
 * paramètres de requête ni de fragment (une recherche peut contenir le nom d'une personne).
 */
export function sanitizePagePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const path = input.trim().split(/[?#]/)[0] ?? "";
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/[\s\\]/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}
