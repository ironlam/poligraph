/**
 * Filtre côté navigateur des envois Umami correspondant à une signature de trafic
 * automatisé connue.
 *
 * Pourquoi la signature n'est pas dans le code : le dépôt est public, et publier les
 * critères exacts indiquerait comment les contourner. Elle vient de la variable
 * d'environnement UMAMI_EXCLUDE_SIGNATURE, gérée dans Vercel. Sans elle, rien n'est filtré.
 *
 * Pourquoi une combinaison de trois critères et jamais un seul : chacun pris isolément
 * est porté par de vrais visiteurs. Seule leur conjonction isole le trafic automatisé.
 *
 * Pourquoi ce filtre n'est qu'un second filet : il retire les statistiques, pas les
 * requêtes. Le blocage relève du Firewall Vercel, configuré dans le dashboard.
 */

/** Nom de la fonction exposée sur window et passée à data-before-send. */
export const UMAMI_BEFORE_SEND_HANDLER = "poligraphUmamiBeforeSend";

/** Balise meta qui transmet la signature au handler, lue au moment de chaque envoi. */
export const UMAMI_EXCLUDE_META_NAME = "poligraph-umami-exclude";

const SEPARATOR = ";";
// Caractères attendus dans une taille d'écran, un code de langue ou un fragment de
// user-agent. Une valeur hors de ce jeu est une erreur de configuration : on n'active rien.
const SAFE_PART = /^[A-Za-z0-9 ._-]{1,64}$/;

export interface ExcludeSignature {
  screen: string;
  language: string;
  userAgentFragment: string;
}

export interface UmamiPayloadSignals {
  screen?: string;
  language?: string;
}

/** Format attendu : "écran;langue;fragment de user-agent". */
export function parseExcludeSignature(raw: string | undefined): ExcludeSignature | null {
  if (!raw) return null;
  const parts = raw.split(SEPARATOR).map((part) => part.trim());
  const [screen, language, userAgentFragment] = parts;
  if (parts.length !== 3 || !screen || !language || !userAgentFragment) return null;
  if (!parts.every((part) => SAFE_PART.test(part))) return null;
  return { screen, language, userAgentFragment };
}

export function serializeExcludeSignature(signature: ExcludeSignature): string {
  return [signature.screen, signature.language, signature.userAgentFragment].join(SEPARATOR);
}

export function matchesExcludeSignature(
  payload: UmamiPayloadSignals,
  userAgent: string,
  signature: ExcludeSignature
): boolean {
  return (
    payload.screen === signature.screen &&
    payload.language === signature.language &&
    userAgent.includes(signature.userAgentFragment)
  );
}

/**
 * Script inline qui définit le handler sur window avant le chargement du tracker,
 * condition posée par la doc Umami. Il est entièrement statique : la signature est lue
 * dans la balise meta, ce qui évite de construire du code à partir d'une valeur
 * (motif signalé par CodeQL). Le test vérifie qu'il rend le même verdict que
 * matchesExcludeSignature.
 */
export const UMAMI_BEFORE_SEND_SCRIPT =
  'window.poligraphUmamiBeforeSend=function(t,p){var m=document.querySelector(\'meta[name="poligraph-umami-exclude"]\');if(!m||!p)return p;var s=(m.getAttribute("content")||"").split(";");if(s.length===3&&p.screen===s[0]&&p.language===s[1]&&navigator.userAgent.indexOf(s[2])!==-1){return false}return p};';
