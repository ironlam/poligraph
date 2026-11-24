/**
 * Legal competences shown on the « échelle des territoires », one fixed line per level. Written
 * by hand from the source below and reread by a person on 2026-11-15.
 *
 * These lines explain how the institutions work. They must never be used to state what a given
 * collectivité actually does: that depends on its statutes and on the transfers decided locally,
 * and is read in its own official sources.
 *
 * Each line keeps to what the official table gives to that level, with its article:
 * - commune: buildings and running of the écoles maternelles et élémentaires, not the teaching
 *   (code de l'éducation, art. L. 212-4), voies communales, documents and autorisations
 *   d'urbanisme (code de l'urbanisme, art. L. 153-1 and L. 422-1), which the table attributes to
 *   « communes ou EPCI »;
 * - intercommunalité: waste and economic development are compulsory by law for the four
 *   categories of EPCI à fiscalité propre, not merely transferred by the communes. Water and
 *   sanitation are left out: they stopped being a compulsory transfer to communautés de communes
 *   with the law of 11 April 2025;
 * - département: collèges (code de l'éducation, art. L. 213-2), aide sociale (enfance, personnes
 *   âgées, handicap, RSA), routes départementales (code de la voirie routière, art. L. 131-1);
 * - région: lycées (code de l'éducation, art. L. 214-6), transports ferroviaires d'intérêt
 *   régional and transports routiers non urbains (code des transports, art. L. 2121-3 and
 *   L. 3111-1), formation professionnelle (code de l'éducation, art. L. 214-12).
 */

export type NiveauTerritoire = "commune" | "intercommunalite" | "departement" | "region";

export const COMPETENCES_TERRITOIRES: Record<NiveauTerritoire, string> = {
  commune:
    "Écoles maternelles et élémentaires (bâtiments et fonctionnement), voirie communale et urbanisme, selon les compétences exercées avec l'intercommunalité.",
  intercommunalite:
    "Gestion des déchets, développement économique et autres compétences exercées en commun, selon sa catégorie et les transferts applicables.",
  departement:
    "Collèges, aide sociale (enfance, personnes âgées, handicap, RSA) et routes départementales.",
  region:
    "Lycées, transports ferroviaires régionaux, transports routiers non urbains et formation professionnelle.",
};

/**
 * Line for the Métropole du Grand Paris and its établissements publics territoriaux, which share
 * between them what a single intercommunalité holds elsewhere: naming waste or economic
 * development on one of the two would be wrong for it.
 */
export const COMPETENCES_GRAND_PARIS =
  "Compétences exercées en commun, selon son statut et les transferts applicables.";

/** Shown under the lines: they are an explanation, not the statutes of a collectivité. */
export const COMPETENCES_MENTION =
  "Principaux domaines de compétence, présentés à titre indicatif et non exhaustif. Leur exercice peut varier selon les transferts de compétences et les statuts particuliers des collectivités.";

export const COMPETENCES_SOURCE = {
  label:
    "DGCL, Répartition des compétences, tableau synthétique en cours d'actualisation (juillet 2025)",
  url: "https://www.collectivites-locales.gouv.fr/files/files/3.%20Animer%20les%20territoires/Tableau%20r%C3%A9paratition%20des%20comp%C3%A9tences_actualisation%20au%20220825.pdf",
  /** Day the lines above were checked against the source. */
  checkedAt: "2026-11-15",
};
