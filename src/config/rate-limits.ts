/**
 * Rate limits centralisés par source API.
 * Valeurs en millisecondes entre chaque requête.
 */

// --- Sources publiques ---
export const WIKIDATA_RATE_LIMIT_MS = 200; // REST API — policy officielle
export const WIKIDATA_SPARQL_RATE_LIMIT_MS = 300; // SPARQL — empirique, timeout fréquents
export const SENAT_RATE_LIMIT_MS = 200; // senat.fr — non documenté, politesse
export const LEGISLATION_RATE_LIMIT_MS = 300; // legifrance — non documenté
export const RSS_RATE_LIMIT_MS = 1000; // Flux RSS presse — politesse standard
export const FACTCHECK_RATE_LIMIT_MS = 200; // Google Fact Check Tools API

// --- Sources publiques additionnelles ---
export const DATA_GOUV_RATE_LIMIT_MS = 200; // data.gouv.fr — politesse
export const ASSEMBLEE_OPENDATA_RATE_LIMIT_MS = 300; // www.assemblee-nationale.fr/dyn/opendata
export const EUROPARL_RATE_LIMIT_MS = 200; // data.europarl.europa.eu
export const HATVP_RATE_LIMIT_MS = 200; // hatvp.fr — politesse

// --- Justice (Judilibre / PISTE) ---
export const JUDILIBRE_RATE_LIMIT_MS = 500; // PISTE OAuth API — politesse

// --- Recherche web ---
export const BRAVE_SEARCH_RATE_LIMIT_MS = 1100; // Free tier: 1 req/s

// --- Elections (scraping ministere) ---
export const INTERIEUR_RATE_LIMIT_MS = 500; // resultats-elections.interieur.gouv.fr

// --- IA (Claude/OpenAI) ---
export const AI_RATE_LIMIT_MS = 500; // Délai entre appels IA
export const AI_429_BACKOFF_MS = 30_000; // Backoff sur rate limit 429
