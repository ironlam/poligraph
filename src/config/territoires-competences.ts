/**
 * Legal competences shown on the « échelle des territoires », one fixed line per level. Written
 * by hand from the source below and meant to be reread by a person: nothing here is derived
 * from a territory's own data.
 *
 * Each line keeps to what the official table gives to that level, with its article:
 * - commune: écoles maternelles et élémentaires (code de l'éducation, art. L. 212-4), voies
 *   communales, documents and autorisations d'urbanisme (code de l'urbanisme, art. L. 153-1 and
 *   L. 422-1), which the table attributes to « communes ou EPCI »;
 * - département: collèges (code de l'éducation, art. L. 213-2), aide sociale (enfance, personnes
 *   âgées, handicap, RSA), routes départementales (code de la voirie routière, art. L. 131-1);
 * - région: lycées (code de l'éducation, art. L. 214-6), transports ferroviaires d'intérêt
 *   régional and transports routiers non urbains (code des transports, art. L. 2121-3 and
 *   L. 3111-1), formation professionnelle (code de l'éducation, art. L. 214-12).
 *
 * No list for an intercommunalité: its competences depend on its category and on what its
 * communes transferred (water and sanitation, for one, stopped being a compulsory transfer to
 * communautés de communes with the law of 11 April 2025), so none is deduced.
 */

export type NiveauTerritoire = "commune" | "intercommunalite" | "departement" | "region";

export const COMPETENCES_TERRITOIRES: Record<NiveauTerritoire, string> = {
  commune:
    "Écoles maternelles et élémentaires, voies communales, urbanisme (seule ou avec d'autres communes).",
  intercommunalite:
    "Les compétences que ses communes lui ont transférées : elles varient selon sa catégorie.",
  departement:
    "Collèges, aide sociale (enfance, personnes âgées, handicap, RSA), routes départementales.",
  region: "Lycées, trains régionaux et cars non urbains, formation professionnelle.",
};

export const COMPETENCES_SOURCE = {
  label:
    "Répartition des compétences, tableau synthétique du ministère chargé des collectivités territoriales (actualisation de juillet 2025)",
  url: "https://www.collectivites-locales.gouv.fr/files/files/3.%20Animer%20les%20territoires/Tableau%20r%C3%A9paratition%20des%20comp%C3%A9tences_actualisation%20au%20220825.pdf",
  /** Day the lines above were checked against the source. */
  checkedAt: "2026-11-15",
};
