/**
 * Presidential presentations ("parrainages"): legal thresholds and display labels. No directive:
 * shared by the readers, the pages and their tests.
 *
 * Wording rule for every surface: an elected official "a présenté" a candidate. A presentation
 * is not a political endorsement, and no surface may say or suggest that it is.
 */

/** Presentations a candidate must gather (loi du 6 novembre 1962, art. 3, I). */
export const SEUIL_PRESENTATIONS = 500;
/** Departments or overseas collectivities they must come from. */
export const SEUIL_DEPARTEMENTS = 30;
/** Share of the 500 that may come from one department: a tenth, so 50. */
export const PLAFOND_PAR_DEPARTEMENT = SEUIL_PRESENTATIONS / 10;

/** Shown once per page, word for word. */
export const MENTION_PRESENTATION =
  "Une présentation n'est pas un soutien politique : la loi demande aux élus de présenter un candidat, pas de se rallier à lui.";

/** Plural label of each mandate group, in the order used by every page. */
export const MANDAT_GROUPES = {
  MAIRE: "Maires",
  MAIRE_DELEGUE: "Maires délégués",
  MAIRE_ARRONDISSEMENT: "Maires d'arrondissement",
  PRESIDENT_EPCI: "Présidents d'intercommunalité",
  CONSEILLER_DEPARTEMENTAL: "Conseillers départementaux",
  CONSEILLER_REGIONAL: "Conseillers régionaux",
  CONSEILLER_PARIS: "Conseillers de Paris",
  CONSEILLER_METROPOLE_LYON: "Conseillers métropolitains de Lyon",
  MEMBRE_ASSEMBLEE_CORSE: "Membres de l'Assemblée de Corse",
  MEMBRE_ASSEMBLEE_OUTRE_MER: "Membres d'assemblées d'outre-mer",
  PRESIDENT_EXECUTIF_OUTRE_MER: "Présidents d'exécutif d'outre-mer",
  DEPUTE: "Députés",
  SENATEUR: "Sénateurs",
  DEPUTE_EUROPEEN: "Députés européens",
  CONSEILLER_AFE: "Conseillers à l'Assemblée des Français de l'étranger",
  PRESIDENT_CONSEIL_CONSULAIRE: "Présidents de conseil consulaire",
} as const;

/** Mandates under which an elected official may present a candidate, one key for both genders. */
export type ParrainageMandat = keyof typeof MANDAT_GROUPES;

/**
 * The 29 labels of the 2022 list. A label absent from this table is not matched by resemblance:
 * the importer reports it and refuses to write.
 */
export const MANDAT_BY_LABEL: Readonly<Record<string, ParrainageMandat>> = {
  Maire: "MAIRE",
  "Maire délégué d'une commune associée ou d'une commune déléguée": "MAIRE_DELEGUE",
  "Maire déléguée d'une commune associée ou d'une commune déléguée": "MAIRE_DELEGUE",
  "Maire d'arrondissement": "MAIRE_ARRONDISSEMENT",
  "Président d'un EPCI à fiscalité propre": "PRESIDENT_EPCI",
  "Présidente d'un EPCI à fiscalité propre": "PRESIDENT_EPCI",
  "Conseiller départemental": "CONSEILLER_DEPARTEMENTAL",
  "Conseillère départementale": "CONSEILLER_DEPARTEMENTAL",
  "Conseiller régional": "CONSEILLER_REGIONAL",
  "Conseillère régionale": "CONSEILLER_REGIONAL",
  "Conseiller de Paris": "CONSEILLER_PARIS",
  "Conseillère de Paris": "CONSEILLER_PARIS",
  "Conseiller métropolitain de Lyon": "CONSEILLER_METROPOLE_LYON",
  "Conseillère métropolitaine de Lyon": "CONSEILLER_METROPOLE_LYON",
  "Membre de l'Assemblée de Corse": "MEMBRE_ASSEMBLEE_CORSE",
  "Membre d'une assemblée d'une collectivité territoriale d'outre-mer à statut particulier":
    "MEMBRE_ASSEMBLEE_OUTRE_MER",
  "Président de la Polynésie française": "PRESIDENT_EXECUTIF_OUTRE_MER",
  "Président du gouvernement de la Nouvelle-Calédonie": "PRESIDENT_EXECUTIF_OUTRE_MER",
  "Président du Conseil exécutif de Martinique": "PRESIDENT_EXECUTIF_OUTRE_MER",
  Député: "DEPUTE",
  Députée: "DEPUTE",
  Sénateur: "SENATEUR",
  Sénatrice: "SENATEUR",
  "Représentant français au Parlement européen": "DEPUTE_EUROPEEN",
  "Représentante française au Parlement européen": "DEPUTE_EUROPEEN",
  "Conseiller à l'Assemblée des Français de l'étranger": "CONSEILLER_AFE",
  "Conseillère à l'Assemblée des Français de l'étranger": "CONSEILLER_AFE",
  "Président du conseil consulaire": "PRESIDENT_CONSEIL_CONSULAIRE",
  "Présidente du conseil consulaire": "PRESIDENT_CONSEIL_CONSULAIRE",
};
