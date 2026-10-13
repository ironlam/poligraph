/**
 * Registre des licences des ressources reprises par la rubrique Territoires (#1052, lot 3.2).
 *
 * Single source of truth, rendered on /territoires/donnees. Each licence below was read on the
 * page named in `licence.verifiedOn`, on the date of `licence.verifiedAt`, never from memory.
 * When the page did not state a licence, `licence.name` is null and `licence.note` says what was
 * found instead: an unknown licence is never filled in by analogy.
 *
 * `status` separates what the published pages and exports already contain (EN_SERVICE) from the
 * imports being prepared (PREVU). The lot that brings a PREVU source in production flips it, after
 * re-checking the licence on the file it actually downloads.
 *
 * Scope: territorial data (communes, departments, regions, mayors, municipal results, outlines).
 * Parliamentary data shown on the same pages (deputies, senators) carries its own source on each
 * page and is not listed here.
 */

export type TerritoireSourceStatus = "EN_SERVICE" | "PREVU";

export interface TerritoireSourceLicence {
  /** Exact licence name as written by the producer, null when none was found. */
  name: string | null;
  url: string | null;
  /** Page on which the licence was read. */
  verifiedOn: string;
  /** ISO date of the check. */
  verifiedAt: string;
  /** What was found when the page is ambiguous or silent. */
  note?: string;
}

export interface TerritoireSource {
  id: string;
  name: string;
  producer: string;
  url: string;
  licence: TerritoireSourceLicence;
  /** Attribution the producer or the licence asks for, null when none is stated. */
  attribution: string | null;
  /** What Poligraph takes from the source. */
  reuse: string;
  status: TerritoireSourceStatus;
}

const LICENCE_OUVERTE_2 = {
  name: "Licence Ouverte / Open Licence version 2.0 (Etalab)",
  url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
} as const;

const INSEE_LEGAL_NOTICE = "https://www.insee.fr/fr/information/2008466";

/** Wording required by INSEE's legal notice, quoted. */
const INSEE_ATTRIBUTION =
  "« Source : Insee », avec la date de dernière mise à jour des données lorsqu'elle est connue.";

/** Licence Ouverte 2.0, « mentionner la paternité »: at least the licensor name and the date of last update. */
const LO2_ATTRIBUTION =
  "Nom du producteur et date de dernière mise à jour des données réutilisées.";

export const TERRITOIRES_SOURCES: readonly TerritoireSource[] = [
  {
    id: "insee-cog",
    name: "Code officiel géographique (COG)",
    producer: "Insee",
    url: "https://www.insee.fr/fr/information/2560452",
    licence: { ...LICENCE_OUVERTE_2, verifiedOn: INSEE_LEGAL_NOTICE, verifiedAt: "2026-10-11" },
    attribution: INSEE_ATTRIBUTION,
    reuse:
      "Codes et noms des régions et des départements, rattachement des départements aux régions, chefs-lieux de région.",
    status: "EN_SERVICE",
  },
  {
    id: "geo-api-communes",
    name: "API Découpage administratif (geo.api.gouv.fr), jeu « decoupage-administratif »",
    producer: "Direction interministérielle du numérique (DINUM)",
    url: "https://geo.api.gouv.fr/decoupage-administratif/communes",
    licence: {
      name: "Licence Ouverte (Etalab), version non précisée",
      url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      verifiedOn: "https://github.com/etalab/decoupage-administratif#licence",
      verifiedAt: "2026-10-11",
      note: "Le site geo.api.gouv.fr et ses mentions légales n'indiquent aucune licence. Le dépôt du jeu de données servi par l'API indique « Données : Licence Ouverte » et cite comme sources le COG et les populations légales de l'Insee et la base officielle des codes postaux de La Poste.",
    },
    attribution: LO2_ATTRIBUTION,
    reuse:
      "Liste des communes : code INSEE, nom, département, région, codes postaux, population municipale, coordonnées du centre.",
    status: "EN_SERVICE",
  },
  {
    id: "insee-circonscriptions",
    name: "Circonscriptions législatives, table de composition communale",
    producer: "Insee",
    url: "https://www.insee.fr/fr/statistiques/6436476",
    licence: { ...LICENCE_OUVERTE_2, verifiedOn: INSEE_LEGAL_NOTICE, verifiedAt: "2026-10-11" },
    attribution: INSEE_ATTRIBUTION,
    reuse:
      "Numéro de circonscription législative enregistré pour chaque commune, présenté comme une circonscription enregistrée et non comme la seule.",
    status: "EN_SERVICE",
  },
  {
    id: "rne",
    name: "Répertoire national des élus",
    producer: "Ministère de l'Intérieur",
    url: "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
    licence: {
      ...LICENCE_OUVERTE_2,
      verifiedOn: "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/",
      verifiedAt: "2026-10-11",
    },
    attribution: LO2_ATTRIBUTION,
    reuse:
      "Maires en fonction : nom, commune, date de début de fonction. Seuls les maires dont la fiche Poligraph est publiée sont nommés.",
    status: "EN_SERVICE",
  },
  {
    id: "municipales-2026-resultats",
    name: "Élections municipales 2026, résultats du premier tour",
    producer: "Ministère de l'Intérieur",
    url: "https://www.data.gouv.fr/datasets/elections-municipales-2026-resultats-du-premier-tour",
    licence: {
      ...LICENCE_OUVERTE_2,
      verifiedOn:
        "https://www.data.gouv.fr/api/1/datasets/elections-municipales-2026-resultats-du-premier-tour/",
      verifiedAt: "2026-10-11",
    },
    attribution: LO2_ATTRIBUTION,
    reuse: "Résultats par liste, participation, votes blancs et nuls, par commune.",
    status: "EN_SERVICE",
  },
  {
    id: "municipales-2026-candidatures",
    name: "Élections municipales 2026, listes candidates au premier tour",
    producer: "Ministère de l'Intérieur",
    url: "https://www.data.gouv.fr/datasets/elections-municipales-2026-listes-candidates-au-premier-tour",
    licence: {
      ...LICENCE_OUVERTE_2,
      verifiedOn:
        "https://www.data.gouv.fr/api/1/datasets/elections-municipales-2026-listes-candidates-au-premier-tour/",
      verifiedAt: "2026-10-11",
    },
    attribution: LO2_ATTRIBUTION,
    reuse: "Listes candidates et têtes de liste, par commune.",
    status: "EN_SERVICE",
  },
  {
    id: "contours-departements",
    name: "Contours simplifiés des départements (public/data/departements.geojson)",
    producer:
      "IGN (ADMIN EXPRESS COG, édition 2018), simplifié par le dépôt gregoiredavid/france-geojson",
    url: "https://github.com/gregoiredavid/france-geojson",
    licence: {
      name: "Licence Ouverte (Etalab), par renvoi aux conditions d'ADMIN EXPRESS",
      url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      verifiedOn: "https://github.com/gregoiredavid/france-geojson#licence",
      verifiedAt: "2026-10-11",
      note: "Le dépôt ne déclare pas de licence propre : sa section Licence renvoie aux conditions d'utilisation d'ADMIN EXPRESS. Il ne contient aucun contour des collectivités d'outre-mer.",
    },
    attribution: LO2_ATTRIBUTION,
    reuse:
      "Silhouettes décoratives des 96 départements métropolitains, précalculées au build. Les données affichées n'en dépendent pas.",
    status: "EN_SERVICE",
  },
  {
    id: "insee-populations-legales",
    name: "Populations légales (fichier d'ensemble)",
    producer: "Insee",
    url: "https://www.insee.fr/fr/statistiques/8680726",
    licence: { ...LICENCE_OUVERTE_2, verifiedOn: INSEE_LEGAL_NOTICE, verifiedAt: "2026-10-11" },
    attribution: INSEE_ATTRIBUTION,
    reuse: "Population légale millésimée de chaque commune, avec sa date d'entrée en vigueur.",
    status: "PREVU",
  },
  {
    id: "insee-populations-com",
    name: "Populations des collectivités d'outre-mer",
    producer: "Insee",
    url: "https://www.insee.fr/fr/statistiques/8680702",
    licence: { ...LICENCE_OUVERTE_2, verifiedOn: INSEE_LEGAL_NOTICE, verifiedAt: "2026-10-11" },
    attribution: INSEE_ATTRIBUTION,
    reuse: "Population des communes des collectivités d'outre-mer.",
    status: "PREVU",
  },
  {
    id: "instituts-ultramarins",
    name: "Recensements de la Polynésie française et de la Nouvelle-Calédonie",
    producer:
      "Institut de la statistique de la Polynésie française (ISPF), Institut de la statistique et des études économiques de Nouvelle-Calédonie (ISEE)",
    url: "https://www.ispf.pf",
    licence: {
      name: null,
      url: null,
      verifiedOn: "https://www.ispf.pf",
      verifiedAt: "2026-10-11",
      note: "Licence non trouvée sur les sites des deux instituts. À établir sur le fichier effectivement importé avant toute reprise.",
    },
    attribution: null,
    reuse: "Population des communes, si l'Insee ne la publie pas.",
    status: "PREVU",
  },
  {
    id: "banatic",
    name: "Base nationale sur l'intercommunalité (BANATIC)",
    producer: "Ministère de l'Intérieur, Direction générale des collectivités locales",
    url: "https://www.banatic.interieur.gouv.fr/",
    licence: {
      name: "Licence Ouverte 2.0 (etalab-2.0), pour les textes du site",
      url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      verifiedOn: "https://www.banatic.interieur.gouv.fr/",
      verifiedAt: "2026-10-11",
      note: "Le pied de page indique : « Sauf mention contraire, tous les textes de ce site sont sous licence etalab-2.0 ». Aucune mention propre aux fichiers de données n'a été trouvée.",
    },
    attribution: LO2_ATTRIBUTION,
    reuse: "Appartenance datée de chaque commune à son intercommunalité.",
    status: "PREVU",
  },
  {
    id: "insee-intercommunalite",
    name: "Intercommunalité, composition communale des EPCI",
    producer: "Insee",
    url: "https://www.insee.fr/fr/information/2510634",
    licence: { ...LICENCE_OUVERTE_2, verifiedOn: INSEE_LEGAL_NOTICE, verifiedAt: "2026-10-11" },
    attribution: INSEE_ATTRIBUTION,
    reuse: "Code et nom de l'EPCI de chaque commune.",
    status: "PREVU",
  },
  {
    id: "ign-admin-express",
    name: "ADMIN EXPRESS",
    producer: "Institut national de l'information géographique et forestière (IGN)",
    url: "https://www.data.gouv.fr/datasets/admin-express-admin-express-cog-admin-express-cog-carto-admin-express-cog-carto-pe-admin-express-cog-carto-plus-pe",
    licence: {
      ...LICENCE_OUVERTE_2,
      verifiedOn:
        "https://www.data.gouv.fr/api/1/datasets/admin-express-admin-express-cog-admin-express-cog-carto-admin-express-cog-carto-pe-admin-express-cog-carto-plus-pe/",
      verifiedAt: "2026-10-11",
      note: "Couvre la métropole et les départements d'outre-mer, pas les collectivités d'outre-mer.",
    },
    attribution: LO2_ATTRIBUTION,
    reuse:
      "Silhouettes décoratives des cinq DROM, de Saint-Pierre-et-Miquelon, de Saint-Barthélemy et de Saint-Martin (édition 2026, petite échelle).",
    status: "EN_SERVICE",
  },
  {
    id: "contours-polynesie",
    name: "Géographie administrative de la Polynésie française, emprise des îles, atolls et bancs",
    producer: "Section Cadastre-Topographie de la Polynésie française",
    url: "https://www.data.gouv.fr/fr/datasets/geographie-administrative-de-la-polynesie-francaise/",
    licence: {
      name: "CC-BY",
      url: "https://www.data.gouv.fr/fr/datasets/geographie-administrative-de-la-polynesie-francaise/",
      verifiedOn:
        "https://www.data.gouv.fr/fr/datasets/geographie-administrative-de-la-polynesie-francaise/",
      verifiedAt: "2026-10-11",
      note: "La page indique CC-BY sans préciser la version.",
    },
    attribution: "Nom du producteur.",
    reuse: "Silhouette décorative de la Polynésie française.",
    status: "EN_SERVICE",
  },
  {
    id: "contours-nouvelle-caledonie",
    name: "Limites administratives terrestres, couche Provinces",
    producer: "Gouvernement de la Nouvelle-Calédonie (DITTT, service topographique)",
    url: "https://georep-dtsi-sgt.opendata.arcgis.com/maps/e1d853903cc64d40af7fbb5ee57e3029/about",
    licence: {
      name: "Licence Ouverte",
      url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      verifiedOn:
        "https://georep-dtsi-sgt.opendata.arcgis.com/maps/e1d853903cc64d40af7fbb5ee57e3029/about",
      verifiedAt: "2026-10-11",
      note: "La page indique Licence Ouverte sans préciser la version.",
    },
    attribution: LO2_ATTRIBUTION,
    reuse: "Silhouette décorative de la Nouvelle-Calédonie (trois provinces réunies).",
    status: "EN_SERVICE",
  },
  {
    id: "contours-natural-earth",
    name: "Natural Earth 1:10m (version 5.1.2)",
    producer: "Natural Earth",
    url: "https://www.naturalearthdata.com/",
    licence: {
      name: "Domaine public",
      url: "https://www.naturalearthdata.com/about/terms-of-use/",
      verifiedOn: "https://www.naturalearthdata.com/about/terms-of-use/",
      verifiedAt: "2026-10-11",
    },
    attribution: null,
    reuse:
      "Silhouette décorative de Wallis-et-Futuna, faute de source publique de l'IGN ou du territoire.",
    status: "EN_SERVICE",
  },
  {
    id: "presidentielle-resultats",
    name: "Élection présidentielle, résultats par commune",
    producer: "Ministère de l'Intérieur",
    url: "https://www.data.gouv.fr/datasets/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour",
    licence: {
      name: null,
      url: null,
      verifiedOn:
        "https://www.data.gouv.fr/api/1/datasets/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/",
      verifiedAt: "2026-10-11",
      note: "Les résultats de 2027 ne sont pas publiés. La fiche data.gouv.fr des résultats de 2022 porte la mention « License Not Specified ». À vérifier sur la fiche 2027 à sa publication.",
    },
    attribution: null,
    reuse: "Résultats par candidat et participation, par commune.",
    status: "PREVU",
  },
  {
    id: "insee-structure-age",
    name: "Évolution et structure de la population en 2022 (base communale)",
    producer: "Insee",
    url: "https://www.insee.fr/fr/statistiques/8581696",
    licence: { ...LICENCE_OUVERTE_2, verifiedOn: INSEE_LEGAL_NOTICE, verifiedAt: "2026-10-13" },
    attribution: INSEE_ATTRIBUTION,
    reuse: "Effectifs par tranche d'âge de chaque commune, ramenés à six tranches.",
    status: "PREVU",
  },
  {
    id: "meteofrance-normales",
    name: "Normales climatiques 1991-2020 des stations de Météo-France",
    producer: "Météo-France",
    url: "https://meteo.data.gouv.fr",
    licence: {
      name: null,
      url: null,
      verifiedOn:
        "https://data.gouv.fr/en/datasets/fiche-climatologique-des-stations-de-meteo-france",
      verifiedAt: "2026-10-13",
      note: "Licence de Météo-France non confirmée : la seule fiche data.gouv.fr trouvée est celle d'une association tierce (Infoclimat), pas celle du producteur. À établir sur le fichier effectivement importé avant toute reprise. Aucun import tant que ce n'est pas fait.",
    },
    attribution: null,
    reuse: "Température moyenne annuelle et précipitations annuelles de la station de référence.",
    status: "PREVU",
  },
];

/**
 * Licence of the compilation Poligraph publishes (exports and releases), decided on 2026-08-31.
 * It covers what Poligraph adds (selection, joins, states such as « non établi »); each upstream
 * source keeps its own licence and attribution, listed above.
 */
export const POLIGRAPH_DATA_LICENCE = {
  name: "Open Database License (ODbL) 1.0",
  url: "https://opendatacommons.org/licenses/odbl/1-0/",
  decidedAt: "2026-08-31",
} as const;
