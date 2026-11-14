// Types for external data sources

// data.gouv.fr CSV structure (Datan dataset)
export interface DeputeCSV {
  id: string; // PA1008
  legislature: string;
  civ: string; // M. / Mme
  nom: string;
  prenom: string;
  villeNaissance: string;
  naissance: string; // YYYY-MM-DD
  age: string;
  groupe: string; // Full group name
  groupeAbrev: string; // SOC, RN, LFI, etc.
  departementNom: string;
  departementCode: string;
  circo: string; // Circonscription number
  datePriseFonction: string;
  job: string; // Profession
  mail: string;
  twitter: string;
  facebook: string;
  website: string;
  nombreMandats: string;
  experienceDepute: string;
  scoreParticipation: string;
  scoreParticipationSpecialite: string;
  scoreLoyaute: string;
  scoreMajorite: string;
  dateMaj: string;
}

export interface SyncResult {
  success: boolean;
  groupsCreated: number;
  groupsUpdated: number;
  deputiesCreated: number;
  deputiesUpdated: number;
  deputiesDeactivated: number;
  groupPresidenciesWritten: number;
  errors: string[];
}

// ============================================
// SENAT API TYPES
// ============================================

// From senat.fr/api-senat/senateurs.json
export interface SenateurAPI {
  matricule: string;
  nom: string;
  prenom: string;
  civilite: string; // "M." or "Mme"
  feminise: boolean;
  tri: string;
  // The API returns the series as a string ("1" / "2"). It was typed `number`,
  // which made `serie === 1` always false. Normalise with `parseSenateSeries()`.
  serie: string | number;
  siege: number;
  url: string;
  urlAvatar: string;
  twitter?: string;
  facebook?: string;
  groupe: {
    code: string;
    libelle: string;
    ordre: number;
  };
  circonscription: {
    code: string;
    libelle: string;
    ordre: number;
  };
  categorieProfessionnelle?: {
    code: string;
    libelle: string;
  };
}

// From archive.nossenateurs.fr/senateurs/json (for birth dates)
export interface NosSenateursAPI {
  id: string;
  nom: string;
  nom_de_famille: string;
  prenom: string;
  sexe: string;
  date_naissance?: string;
  lieu_naissance?: string;
  num_deptmt?: string;
  nom_circo?: string;
  groupe_sigle?: string;
  parti_ratt_financier?: string;
  mandat_debut?: string;
  mandat_fin?: string;
  ancien_senateur?: number;
  nb_mandats?: number;
  profession?: string;
  place_en_hemicycle?: string;
  url_institution?: string;
  id_institution?: string;
  slug?: string;
}

export interface SenatSyncResult {
  success: boolean;
  groupsCreated: number;
  groupsUpdated: number;
  senatorsCreated: number;
  senatorsUpdated: number;
  groupPresidenciesWritten: number;
  errors: string[];
}

// ============================================
// GOVERNMENT API TYPES
// ============================================

// From data.gouv.fr - Historique des Gouvernements
export interface GouvernementCSV {
  id: string; // Government ID (e.g., "546")
  gouvernement: string; // Government name (PM name)
  code_fonction: string; // PM, ME, M, MD, SE
  prenom: string;
  nom: string;
  fonction: string; // Full function title
  date_debut_fonction: string; // French date: "vendredi 13 décembre 2024"
  date_fin_fonction: string; // Empty if current
}

export interface GouvernementSyncResult {
  success: boolean;
  membersCreated: number;
  membersUpdated: number;
  mandatesCreated: number;
  errors: string[];
  skipped?: string;
}

// ============================================
// HATVP API TYPES
// ============================================

// From hatvp.fr/livraison/opendata/liste.csv
export interface HATVPCSV {
  civilite: string; // M. / Mme
  prenom: string;
  nom: string; // NOM (uppercase)
  classement: string; // HATVP person ID (Wikidata P4703), e.g. "macronaaaemmanuel5835"
  type_mandat: string; // depute, senateur, gouvernement, commune, etc.
  qualite: string; // Full mandate description
  type_document: string; // di, dim, dia, diam, dsp, dspm, dspfm
  departement: string; // Department code
  date_publication: string; // YYYY-MM-DD
  date_depot: string; // YYYY-MM-DD
  nom_fichier: string; // PDF filename
  url_dossier: string; // Relative URL to personal page
  open_data: string; // XML filename if available
  statut_publication: string; // Livree, Declaration deposee, etc.
  id_origine: string; // External ID (AN or Senat ID)
  url_photo: string; // Official photo URL
}

export interface HATVPSyncResult {
  success: boolean;
  declarationsCreated: number;
  declarationsUpdated: number;
  politiciansMatched: number;
  politiciansNotFound: number;
  xmlParsed: number;
  xmlErrors: number;
  errors: string[];
}

// HATVP document type to DeclarationType mapping
export const HATVP_DOCUMENT_TYPE_MAPPING: Record<string, string> = {
  di: "INTERETS",
  dim: "INTERETS",
  dia: "INTERETS",
  diam: "INTERETS",
  dsp: "PATRIMOINE_DEBUT_MANDAT",
  dspm: "PATRIMOINE_MODIFICATION",
  dspfm: "PATRIMOINE_FIN_MANDAT",
};

// Government function code to MandateType mapping
export const GOUV_FUNCTION_MAPPING: Record<string, string> = {
  PM: "PREMIER_MINISTRE",
  PE: "PREMIER_MINISTRE", // Sometimes written as PE
  ME: "MINISTRE", // Ministre d'État is still a minister
  M: "MINISTRE",
  MD: "MINISTRE_DELEGUE",
  SE: "SECRETAIRE_ETAT",
};

// ============================================
// EUROPEAN PARLIAMENT API TYPES
// ============================================

// From data.europarl.europa.eu API
export interface EuroparlDepute {
  id: string; // "person/97236"
  type: string; // "Person"
  identifier: string; // "97236"
  label: string; // "Marie TOUSSAINT"
  familyName: string; // "Toussaint"
  givenName: string; // "Marie"
  sortLabel?: string; // "TOUSSAINTMR"
  officialFamilyName?: string; // For non-Latin scripts
  officialGivenName?: string;
  "api:country-of-representation": string; // "FR"
  "api:political-group": string; // "Verts/ALE"
  bday?: string; // "1987-05-27"
  hasEmail?: string; // "mailto:..."
  hasGender?: string; // URI
}

export interface EuroparlSyncResult {
  success: boolean;
  mepsCreated: number;
  mepsUpdated: number;
  mandatesCreated: number;
  mandatesUpdated: number;
  errors: string[];
}

// ============================================
// CANDIDATURES MUNICIPALES (data.gouv.fr) TYPES
// ============================================

// CSV columns — 2026 format (semicolon-delimited, UTF-8, no comment header)
export interface CandidatureMunicipaleCSV {
  "Code département": string;
  Département: string;
  "Code circonscription": string;
  Circonscription: string;
  "Numéro de panneau": string;
  "Libellé abrégé de liste": string;
  "Libellé de la liste": string;
  "Code nuance de liste": string;
  "Nuance de liste": string;
  "Tête de liste": string;
  Ordre: string;
  Sexe: string;
  "Nom sur le bulletin de vote": string;
  "Prénom sur le bulletin de vote": string;
  Nationalité: string;
  "Code personnalité": string;
  CC: string;
}

export interface CandidaturesSyncResult {
  success: boolean;
  candidaciesCreated: number;
  candidaciesUpdated: number;
  candidatesCreated: number;
  candidaciesWithCommune: number;
  politiciansMatched: number;
  politiciansNotFound: number;
  errors: string[];
}

// ============================================
// RNE (Répertoire National des Élus) TYPES
// ============================================

// CSV columns (semicolon-delimited, ~35k rows)
export interface MaireRNECSV {
  "Code du département": string;
  "Libellé du département": string;
  "Code de la collectivité à statut particulier": string;
  "Libellé de la collectivité à statut particulier": string;
  "Code de la commune": string;
  "Libellé de la commune": string;
  "Nom de l'élu": string;
  "Prénom de l'élu": string;
  "Code sexe": string; // M or F
  "Date de naissance": string; // DD/MM/YYYY
  "Code de la catégorie socio-professionnelle": string;
  "Libellé de la catégorie socio-professionnelle": string;
  "Date de début du mandat": string; // DD/MM/YYYY
  "Date de début de la fonction": string; // DD/MM/YYYY
}

/** What Phase 2 would decide about the profiles a dry run would have created. */
export interface Phase2Simulation {
  /** Profiles that would be merged into an existing one, then DELETED. Irreversible. */
  matched: number;
  /** Possible duplicates: created, then set to DRAFT for a human to arbitrate. */
  review: number;
  /** No candidate: the created profile stays. */
  notFound: number;
  /** Every candidate carries a NOT_SAME decision. */
  blocked: number;
}

export interface RNESyncResult {
  success: boolean;
  officialsCreated: number;
  officialsUpdated: number;
  officialsClosed: number;
  mandatesCreated: number;
  mandatesUpdated: number;
  mandatesClosed: number;
  politiciansMatched: number;
  politiciansNotFound: number;
  errors: string[];
  /** Dry run only: what Phase 2 would do, measured without writing. */
  phase2Simulation?: Phase2Simulation;
}

// ============================================
