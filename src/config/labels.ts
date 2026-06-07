import type {
  AffairStatus,
  AffairCategory,
  AffairSeverity,
  Involvement,
  MandateType,
  DataSource,
  PoliticalPosition,
  AffairEventType,
  VotePosition,
  VotingResult,
  Chamber,
  FactCheckRating,
  PartyRole,
  ThemeCategory,
  ElectionType,
  ElectionStatus,
  ElectionScope,
  SuffrageType,
  SourceType,
  PublicationStatus,
  PlatformUpdateType,
  GroupPosition,
  AnalysisSourceType,
  ScrutinType,
  ThematicAxis,
  QuizElectionScope,
  PromiseSourceKind,
  PromiseExtractionStatus,
} from "@/types";

// Nombre de sièges à l'Assemblée nationale (XVIIe législature)
export const AN_SEAT_COUNT = 577;

export const AFFAIR_STATUS_LABELS: Record<AffairStatus, string> = {
  ENQUETE_PRELIMINAIRE: "Enquête préliminaire",
  INSTRUCTION: "Instruction en cours",
  MISE_EN_EXAMEN: "Mise en examen",
  RENVOI_TRIBUNAL: "Renvoi devant le tribunal",
  PROCES_EN_COURS: "Procès en cours",
  CONDAMNATION_PREMIERE_INSTANCE: "Condamnation (1ère instance)",
  APPEL_EN_COURS: "Appel en cours",
  CONDAMNATION_DEFINITIVE: "Condamnation définitive",
  RELAXE: "Relaxe",
  ACQUITTEMENT: "Acquittement",
  NON_LIEU: "Non-lieu",
  PRESCRIPTION: "Action publique éteinte par prescription",
  CLASSEMENT_SANS_SUITE: "Classement sans suite",
};

export const AFFAIR_STATUS_COLORS: Record<AffairStatus, string> = {
  ENQUETE_PRELIMINAIRE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  INSTRUCTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  MISE_EN_EXAMEN: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  RENVOI_TRIBUNAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  PROCES_EN_COURS: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  CONDAMNATION_PREMIERE_INSTANCE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  APPEL_EN_COURS: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  CONDAMNATION_DEFINITIVE: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  RELAXE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  ACQUITTEMENT: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  NON_LIEU: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
  PRESCRIPTION: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
  CLASSEMENT_SANS_SUITE: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
};

export const AFFAIR_STATUS_DESCRIPTIONS: Record<AffairStatus, string> = {
  ENQUETE_PRELIMINAIRE:
    "Le parquet a ordonné une enquête pour vérifier les faits. Aucune mise en cause formelle.",
  INSTRUCTION:
    "Un juge d'instruction mène des investigations approfondies pour établir les responsabilités.",
  MISE_EN_EXAMEN:
    "Le juge considère qu'il existe des indices graves contre la personne. Ce n'est pas une condamnation.",
  RENVOI_TRIBUNAL: "Le juge a considéré les charges suffisantes pour un procès devant le tribunal.",
  PROCES_EN_COURS: "L'affaire est actuellement jugée devant un tribunal.",
  CONDAMNATION_PREMIERE_INSTANCE:
    "Le tribunal a prononcé une condamnation, mais un appel est encore possible.",
  APPEL_EN_COURS: "La décision du tribunal est contestée devant la cour d'appel.",
  CONDAMNATION_DEFINITIVE:
    "Toutes les voies de recours sont épuisées. La condamnation est définitive.",
  RELAXE: "Le tribunal correctionnel a déclaré la personne non coupable.",
  ACQUITTEMENT: "La cour d'assises a déclaré la personne non coupable.",
  NON_LIEU: "Le juge d'instruction a conclu que les charges étaient insuffisantes pour un procès.",
  PRESCRIPTION:
    "La prescription clôt la procédure sans condamnation, mais ne constitue pas une décision sur le fond.",
  CLASSEMENT_SANS_SUITE: "Le procureur a décidé de ne pas poursuivre l'affaire.",
};

// Indicates if presumption of innocence reminder is needed
export const AFFAIR_STATUS_NEEDS_PRESUMPTION: Record<AffairStatus, boolean> = {
  ENQUETE_PRELIMINAIRE: true,
  INSTRUCTION: true,
  MISE_EN_EXAMEN: true,
  RENVOI_TRIBUNAL: true,
  PROCES_EN_COURS: true,
  CONDAMNATION_PREMIERE_INSTANCE: true, // Can still appeal
  APPEL_EN_COURS: true,
  CONDAMNATION_DEFINITIVE: false,
  RELAXE: false,
  ACQUITTEMENT: false,
  NON_LIEU: false,
  PRESCRIPTION: false,
  CLASSEMENT_SANS_SUITE: false,
};

/**
 * Prisma `where` clause for conviction badges.
 * Use this everywhere a badge, count or highlight depends on "condamnation
 * définitive pour atteinte à la probité".  Single source of truth so the
 * filter never drifts between pages.
 */
export const CONVICTION_BADGE_WHERE = {
  publicationStatus: "PUBLISHED" as const,
  involvement: "DIRECT" as const,
  status: "CONDAMNATION_DEFINITIVE" as const,
  severity: "CRITIQUE" as const,
};

export const AFFAIR_CATEGORY_LABELS: Record<AffairCategory, string> = {
  CORRUPTION: "Corruption",
  CORRUPTION_PASSIVE: "Corruption passive",
  TRAFIC_INFLUENCE: "Trafic d'influence",
  PRISE_ILLEGALE_INTERETS: "Prise illégale d'intérêts",
  FAVORITISME: "Favoritisme",
  DETOURNEMENT_FONDS_PUBLICS: "Détournement de fonds publics",
  FRAUDE_FISCALE: "Fraude fiscale",
  BLANCHIMENT: "Blanchiment",
  ABUS_BIENS_SOCIAUX: "Abus de biens sociaux",
  ABUS_CONFIANCE: "Abus de confiance",
  EMPLOI_FICTIF: "Emploi fictif",
  FINANCEMENT_ILLEGAL_CAMPAGNE: "Financement illégal de campagne",
  FINANCEMENT_ILLEGAL_PARTI: "Financement illégal de parti",
  HARCELEMENT_MORAL: "Harcèlement moral",
  HARCELEMENT_SEXUEL: "Harcèlement sexuel",
  AGRESSION_SEXUELLE: "Agression sexuelle",
  VIOLENCE: "Violence",
  MENACE: "Menace",
  DIFFAMATION: "Diffamation",
  INJURE: "Injure",
  INCITATION_HAINE: "Incitation à la haine",
  FAUX_ET_USAGE_FAUX: "Faux et usage de faux",
  RECEL: "Recel",
  CONFLIT_INTERETS: "Conflit d'intérêts",
  AUTRE: "Autre",
};

// Involvement labels (politician's role in the affair)
export const INVOLVEMENT_LABELS: Record<Involvement, string> = {
  DIRECT: "Mis en cause",
  INDIRECT: "Témoin/Secondaire",
  MENTIONED_ONLY: "Mentionné",
  VICTIM: "Victime",
  PLAINTIFF: "Plaignant",
};

// Affair severity (Sapin II inspired gravity scale)
export const AFFAIR_SEVERITY_LABELS: Record<AffairSeverity, string> = {
  CRITIQUE: "Critique",
  GRAVE: "Grave",
  SIGNIFICATIF: "Significatif",
};

export const INVOLVEMENT_COLORS: Record<Involvement, string> = {
  DIRECT:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  INDIRECT:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700",
  MENTIONED_ONLY:
    "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700",
  VICTIM:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  PLAINTIFF:
    "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700",
};

// Involvement filter groups for /affaires page
export type InvolvementGroup = "mise-en-cause" | "victime" | "mentionne";

export const INVOLVEMENT_GROUP_LABELS: Record<InvolvementGroup, string> = {
  "mise-en-cause": "Mis en cause",
  victime: "Victime / Plaignant",
  mentionne: "Mentionné",
};

export const INVOLVEMENT_GROUP_VALUES: Record<InvolvementGroup, Involvement[]> = {
  "mise-en-cause": ["DIRECT", "INDIRECT"],
  victime: ["VICTIM", "PLAINTIFF"],
  mentionne: ["MENTIONED_ONLY"],
};

export const INVOLVEMENT_GROUP_COLORS: Record<InvolvementGroup, string> = {
  "mise-en-cause":
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  victime:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  mentionne:
    "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700",
};

export function involvementsFromGroups(groups: InvolvementGroup[]): Involvement[] {
  return groups.flatMap((g) => INVOLVEMENT_GROUP_VALUES[g]);
}

// Super-categories for grouping
export type AffairSuperCategory = "PROBITE" | "FINANCES" | "PERSONNES" | "EXPRESSION" | "AUTRE";

export const AFFAIR_SUPER_CATEGORY_LABELS: Record<AffairSuperCategory, string> = {
  PROBITE: "Atteintes à la probité",
  FINANCES: "Infractions financières",
  PERSONNES: "Atteintes aux personnes",
  EXPRESSION: "Infractions d'expression",
  AUTRE: "Autres infractions",
};

export const AFFAIR_SUPER_CATEGORY_DESCRIPTIONS: Record<AffairSuperCategory, string> = {
  PROBITE: "Corruption, détournement de fonds, emplois fictifs, prise illégale d'intérêts",
  FINANCES: "Fraude fiscale, blanchiment, abus de biens sociaux",
  PERSONNES: "Harcèlement, agressions, violences",
  EXPRESSION: "Diffamation, injure, incitation à la haine",
  AUTRE: "Autres types d'infractions",
};

export const AFFAIR_SUPER_CATEGORY_COLORS: Record<AffairSuperCategory, string> = {
  PROBITE:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  FINANCES:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  PERSONNES:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  EXPRESSION:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  AUTRE:
    "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700",
};

// Map categories to super-categories
export const CATEGORY_TO_SUPER: Record<AffairCategory, AffairSuperCategory> = {
  CORRUPTION: "PROBITE",
  CORRUPTION_PASSIVE: "PROBITE",
  TRAFIC_INFLUENCE: "PROBITE",
  PRISE_ILLEGALE_INTERETS: "PROBITE",
  FAVORITISME: "PROBITE",
  DETOURNEMENT_FONDS_PUBLICS: "PROBITE",
  EMPLOI_FICTIF: "PROBITE",
  CONFLIT_INTERETS: "PROBITE",
  FINANCEMENT_ILLEGAL_CAMPAGNE: "FINANCES",
  FINANCEMENT_ILLEGAL_PARTI: "FINANCES",
  FRAUDE_FISCALE: "FINANCES",
  BLANCHIMENT: "FINANCES",
  ABUS_BIENS_SOCIAUX: "FINANCES",
  ABUS_CONFIANCE: "FINANCES",
  RECEL: "FINANCES",
  HARCELEMENT_MORAL: "PERSONNES",
  HARCELEMENT_SEXUEL: "PERSONNES",
  AGRESSION_SEXUELLE: "PERSONNES",
  VIOLENCE: "PERSONNES",
  MENACE: "PERSONNES",
  DIFFAMATION: "EXPRESSION",
  INJURE: "EXPRESSION",
  INCITATION_HAINE: "EXPRESSION",
  FAUX_ET_USAGE_FAUX: "AUTRE",
  AUTRE: "AUTRE",
};

// Get categories for a super-category
export function getCategoriesForSuper(superCat: AffairSuperCategory): AffairCategory[] {
  return Object.entries(CATEGORY_TO_SUPER)
    .filter(([, sc]) => sc === superCat)
    .map(([cat]) => cat as AffairCategory);
}

// ─── Affair Severity (internal classification, used by admin/moderation) ─────

// Default severity per category (before isRelatedToMandate promotion)
const CATEGORY_DEFAULT_SEVERITY: Record<AffairCategory, AffairSeverity> = {
  // CRITIQUE — Probity violations (by definition linked to mandate)
  CORRUPTION: "CRITIQUE",
  CORRUPTION_PASSIVE: "CRITIQUE",
  TRAFIC_INFLUENCE: "CRITIQUE",
  PRISE_ILLEGALE_INTERETS: "CRITIQUE",
  FAVORITISME: "CRITIQUE",
  DETOURNEMENT_FONDS_PUBLICS: "CRITIQUE",
  EMPLOI_FICTIF: "CRITIQUE",
  FINANCEMENT_ILLEGAL_CAMPAGNE: "CRITIQUE",
  FINANCEMENT_ILLEGAL_PARTI: "CRITIQUE",
  INCITATION_HAINE: "CRITIQUE",
  // GRAVE — Serious infractions
  AGRESSION_SEXUELLE: "GRAVE",
  HARCELEMENT_SEXUEL: "GRAVE",
  HARCELEMENT_MORAL: "GRAVE",
  FRAUDE_FISCALE: "GRAVE",
  BLANCHIMENT: "GRAVE",
  ABUS_BIENS_SOCIAUX: "GRAVE",
  ABUS_CONFIANCE: "GRAVE",
  FAUX_ET_USAGE_FAUX: "GRAVE",
  RECEL: "GRAVE",
  CONFLIT_INTERETS: "GRAVE",
  MENACE: "GRAVE",
  // SIGNIFICATIF — Common law infractions
  VIOLENCE: "SIGNIFICATIF",
  DIFFAMATION: "SIGNIFICATIF",
  INJURE: "SIGNIFICATIF",
  AUTRE: "SIGNIFICATIF",
};

// Categories inherently related to mandate (isRelatedToMandate forced true)
const INHERENTLY_MANDATE_CATEGORIES: Set<AffairCategory> = new Set([
  "CORRUPTION",
  "CORRUPTION_PASSIVE",
  "TRAFIC_INFLUENCE",
  "PRISE_ILLEGALE_INTERETS",
  "FAVORITISME",
  "DETOURNEMENT_FONDS_PUBLICS",
  "EMPLOI_FICTIF",
  "FINANCEMENT_ILLEGAL_CAMPAGNE",
  "FINANCEMENT_ILLEGAL_PARTI",
  "INCITATION_HAINE",
]);

const SEVERITY_ORDER: AffairSeverity[] = ["CRITIQUE", "GRAVE", "SIGNIFICATIF"];

/**
 * Compute affair severity from category and mandate relation.
 * Single source of truth — called on every affair creation/update.
 */
export function computeSeverity(
  category: AffairCategory,
  isRelatedToMandate: boolean
): AffairSeverity {
  const base = CATEGORY_DEFAULT_SEVERITY[category] || "SIGNIFICATIF";
  if (!isRelatedToMandate) return base;
  // Promote by one tier
  const idx = SEVERITY_ORDER.indexOf(base);
  return idx > 0 ? SEVERITY_ORDER[idx - 1]! : base;
}

/**
 * Returns true if a category is inherently linked to the mandate.
 * For these categories, isRelatedToMandate should always be true.
 */
export function isInherentlyMandateCategory(category: AffairCategory): boolean {
  return INHERENTLY_MANDATE_CATEGORIES.has(category);
}

export const NATIONAL_MANDATE_TYPES: MandateType[] = [
  "DEPUTE",
  "SENATEUR",
  "DEPUTE_EUROPEEN",
  "MINISTRE",
  "SECRETAIRE_ETAT",
  "PREMIER_MINISTRE",
  "PRESIDENT_REPUBLIQUE",
];

export const LOCAL_MANDATE_TYPES: MandateType[] = [
  "MAIRE",
  "ADJOINT_MAIRE",
  "CONSEILLER_MUNICIPAL",
  "PRESIDENT_DEPARTEMENT",
  "VICE_PRESIDENT_DEPARTEMENT",
  "CONSEILLER_DEPARTEMENTAL",
  "PRESIDENT_REGION",
  "VICE_PRESIDENT_REGION",
  "CONSEILLER_REGIONAL",
];

export const ROLE_TO_MANDATE_TYPE: Record<string, MandateType> = {
  MAIRE: "MAIRE",
  ADJOINT_MAIRE: "ADJOINT_MAIRE",
  CONSEILLER_MUNICIPAL: "CONSEILLER_MUNICIPAL",
  PRESIDENT_DEPARTEMENT: "PRESIDENT_DEPARTEMENT",
  VICE_PRESIDENT_DEPARTEMENT: "VICE_PRESIDENT_DEPARTEMENT",
  CONSEILLER_DEPARTEMENTAL: "CONSEILLER_DEPARTEMENTAL",
  PRESIDENT_REGION: "PRESIDENT_REGION",
  VICE_PRESIDENT_REGION: "VICE_PRESIDENT_REGION",
  CONSEILLER_REGIONAL: "CONSEILLER_REGIONAL",
};

export const MANDATE_TYPE_LABELS: Record<MandateType, string> = {
  DEPUTE: "Député",
  SENATEUR: "Sénateur",
  DEPUTE_EUROPEEN: "Député européen",
  PRESIDENT_REPUBLIQUE: "Président de la République",
  PREMIER_MINISTRE: "Premier ministre",
  MINISTRE: "Ministre",
  SECRETAIRE_ETAT: "Secrétaire d'État",
  MINISTRE_DELEGUE: "Ministre délégué",
  PRESIDENT_REGION: "Président de région",
  VICE_PRESIDENT_REGION: "Vice-président du conseil régional",
  PRESIDENT_DEPARTEMENT: "Président de département",
  VICE_PRESIDENT_DEPARTEMENT: "Vice-président du conseil départemental",
  MAIRE: "Maire",
  ADJOINT_MAIRE: "Adjoint au maire",
  CONSEILLER_REGIONAL: "Conseiller régional",
  CONSEILLER_DEPARTEMENTAL: "Conseiller départemental",
  CONSEILLER_MUNICIPAL: "Conseiller municipal",
  PRESIDENT_PARTI: "Dirigeant(e) de parti",
  OTHER: "Autre mandat",
};

export const MANDATE_TYPE_LABELS_PLURAL: Record<MandateType, string> = {
  DEPUTE: "Députés",
  SENATEUR: "Sénateurs",
  DEPUTE_EUROPEEN: "Députés européens",
  PRESIDENT_REPUBLIQUE: "Présidents de la République",
  PREMIER_MINISTRE: "Premiers ministres",
  MINISTRE: "Ministres",
  SECRETAIRE_ETAT: "Secrétaires d'État",
  MINISTRE_DELEGUE: "Ministres délégués",
  PRESIDENT_REGION: "Présidents de région",
  VICE_PRESIDENT_REGION: "Vice-présidents du conseil régional",
  PRESIDENT_DEPARTEMENT: "Présidents de département",
  VICE_PRESIDENT_DEPARTEMENT: "Vice-présidents du conseil départemental",
  MAIRE: "Maires",
  ADJOINT_MAIRE: "Adjoints au maire",
  CONSEILLER_REGIONAL: "Conseillers régionaux",
  CONSEILLER_DEPARTEMENTAL: "Conseillers départementaux",
  CONSEILLER_MUNICIPAL: "Conseillers municipaux",
  PRESIDENT_PARTI: "Dirigeant(e)s de parti",
  OTHER: "Autres mandats",
};

// Feminize institutional roles based on civility
export function feminizeRole(role: string, civility?: string | null): string {
  if (civility !== "Mme") return role;
  return role.replace(/^Président /, "Présidente ").replace(/^Vice-président /, "Vice-présidente ");
}

// Salary information (public data, monthly gross in EUR)
export const MANDATE_SALARIES: Partial<Record<MandateType, number>> = {
  DEPUTE: 7493, // Indemnité parlementaire brute
  SENATEUR: 7493,
  DEPUTE_EUROPEEN: 9808,
  PRESIDENT_REPUBLIQUE: 15900,
  PREMIER_MINISTRE: 15900,
  MINISTRE: 10647,
  SECRETAIRE_ETAT: 10135,
  MINISTRE_DELEGUE: 10135,
};

// Source type labels (for affair sources)
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  WIKIDATA: "Wikidata",
  JUDILIBRE: "Judilibre",
  LEGIFRANCE: "Légifrance",
  PRESSE: "Presse",
  WIKIPEDIA: "Wikipedia",
  MANUAL: "Saisie manuelle",
};

// Data source labels
export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  ASSEMBLEE_NATIONALE: "Assemblée nationale",
  SENAT: "Sénat",
  PARLEMENT_EUROPEEN: "Parlement européen",
  WIKIDATA: "Wikidata",
  HATVP: "HATVP",
  GOUVERNEMENT: "Gouvernement",
  NOSDEPUTES: "NosDéputés.fr",
  WIKIPEDIA: "Wikipédia",
  MANUAL: "Saisie manuelle",
  RNE: "Répertoire National des Élus",
  MUNICIPALES: "Candidatures municipales",
  PRESS: "Presse",
  FACTCHECK: "Fact-checks",
  JUDILIBRE: "Judilibre",
  OPENSANCTIONS: "OpenSanctions",
};

export const DATA_SOURCE_URLS: Record<DataSource, string> = {
  ASSEMBLEE_NATIONALE: "https://www.assemblee-nationale.fr/dyn/deputes/",
  SENAT: "https://www.senat.fr/senateur/",
  PARLEMENT_EUROPEEN: "https://www.europarl.europa.eu/meps/fr/",
  WIKIDATA: "https://www.wikidata.org/wiki/",
  HATVP: "https://www.hatvp.fr/",
  GOUVERNEMENT: "https://www.gouvernement.fr/",
  NOSDEPUTES: "https://www.nosdeputes.fr/",
  WIKIPEDIA: "https://fr.wikipedia.org/wiki/",
  MANUAL: "",
  RNE: "https://www.data.gouv.fr/fr/datasets/repertoire-national-des-elus-1/",
  MUNICIPALES:
    "https://www.data.gouv.fr/datasets/elections-municipales-2026-listes-candidates-au-premier-tour",
  PRESS: "",
  FACTCHECK: "",
  JUDILIBRE: "https://www.courdecassation.fr/acces-rapide-judilibre",
  OPENSANCTIONS: "https://www.opensanctions.org/entities/",
};

// Political position labels (for parties)
export const POLITICAL_POSITION_LABELS: Record<PoliticalPosition, string> = {
  FAR_LEFT: "Extrême gauche",
  LEFT: "Gauche",
  CENTER_LEFT: "Centre gauche",
  CENTER: "Centre",
  CENTER_RIGHT: "Centre droit",
  RIGHT: "Droite",
  FAR_RIGHT: "Extrême droite",
};

export const POLITICAL_POSITION_COLORS: Record<PoliticalPosition, string> = {
  FAR_LEFT: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  LEFT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  CENTER_LEFT: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  CENTER: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  CENTER_RIGHT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  RIGHT: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  FAR_RIGHT: "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200",
};

// Hex colors for graphical representations (spectrum charts, etc.)
export const POLITICAL_POSITION_HEX_COLORS: Record<PoliticalPosition, string> = {
  FAR_LEFT: "#991b1b",
  LEFT: "#dc2626",
  CENTER_LEFT: "#f472b6",
  CENTER: "#eab308",
  CENTER_RIGHT: "#38bdf8",
  RIGHT: "#2563eb",
  FAR_RIGHT: "#1e3a8a",
};

// Order for display (left to right)
export const POLITICAL_POSITION_ORDER: PoliticalPosition[] = [
  "FAR_LEFT",
  "LEFT",
  "CENTER_LEFT",
  "CENTER",
  "CENTER_RIGHT",
  "RIGHT",
  "FAR_RIGHT",
];

// Affair event type labels (chronology)
export const AFFAIR_EVENT_TYPE_LABELS: Record<AffairEventType, string> = {
  FAITS: "Faits",
  REVELATION: "Révélation médiatique",
  PLAINTE: "Dépôt de plainte",
  ENQUETE_PRELIMINAIRE: "Enquête préliminaire",
  INFORMATION_JUDICIAIRE: "Information judiciaire",
  PERQUISITION: "Perquisition",
  GARDE_A_VUE: "Garde à vue",
  MISE_EN_EXAMEN: "Mise en examen",
  CONTROLE_JUDICIAIRE: "Contrôle judiciaire",
  DETENTION_PROVISOIRE: "Détention provisoire",
  RENVOI_TRIBUNAL: "Renvoi devant le tribunal",
  PROCES: "Procès",
  REQUISITOIRE: "Réquisitoire",
  JUGEMENT: "Jugement",
  APPEL: "Appel interjeté",
  PROCES_APPEL: "Procès en appel",
  ARRET_APPEL: "Arrêt de la cour d'appel",
  POURVOI_CASSATION: "Pourvoi en cassation",
  ARRET_CASSATION: "Arrêt de la Cour de cassation",
  RELAXE: "Relaxe",
  ACQUITTEMENT: "Acquittement",
  CONDAMNATION: "Condamnation",
  PRESCRIPTION: "Prescription",
  NON_LIEU: "Non-lieu",
  AUTRE: "Autre événement",
};

// Event type colors for timeline display
export const AFFAIR_EVENT_TYPE_COLORS: Record<AffairEventType, string> = {
  FAITS: "bg-gray-500",
  REVELATION: "bg-yellow-500",
  PLAINTE: "bg-orange-400",
  ENQUETE_PRELIMINAIRE: "bg-orange-500",
  INFORMATION_JUDICIAIRE: "bg-orange-600",
  PERQUISITION: "bg-amber-500",
  GARDE_A_VUE: "bg-amber-600",
  MISE_EN_EXAMEN: "bg-red-400",
  CONTROLE_JUDICIAIRE: "bg-red-500",
  DETENTION_PROVISOIRE: "bg-red-600",
  RENVOI_TRIBUNAL: "bg-purple-500",
  PROCES: "bg-purple-600",
  REQUISITOIRE: "bg-purple-700",
  JUGEMENT: "bg-indigo-500",
  APPEL: "bg-blue-400",
  PROCES_APPEL: "bg-blue-500",
  ARRET_APPEL: "bg-blue-600",
  POURVOI_CASSATION: "bg-sky-500",
  ARRET_CASSATION: "bg-sky-600",
  RELAXE: "bg-green-500",
  ACQUITTEMENT: "bg-green-600",
  CONDAMNATION: "bg-red-700",
  PRESCRIPTION: "bg-gray-400",
  NON_LIEU: "bg-gray-500",
  AUTRE: "bg-gray-600",
};

// ============================================
// PARLIAMENTARY VOTES
// ============================================

export const VOTE_POSITION_LABELS: Record<VotePosition, string> = {
  POUR: "Pour",
  CONTRE: "Contre",
  ABSTENTION: "Abstention",
  NON_VOTANT: "Non-votant",
  ABSENT: "Absent",
};

export const VOTE_POSITION_COLORS: Record<VotePosition, string> = {
  POUR: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700",
  CONTRE:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  ABSTENTION:
    "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700",
  NON_VOTANT:
    "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700",
  ABSENT:
    "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700",
};

export const VOTE_POSITION_DOT_COLORS: Record<VotePosition, string> = {
  POUR: "bg-green-500",
  CONTRE: "bg-red-500",
  ABSTENTION: "bg-yellow-500",
  NON_VOTANT: "bg-gray-500",
  ABSENT: "bg-gray-400",
};

export const VOTING_RESULT_LABELS: Record<VotingResult, string> = {
  ADOPTED: "Adopté",
  REJECTED: "Rejeté",
};

export const VOTING_RESULT_COLORS: Record<VotingResult, string> = {
  ADOPTED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// ============================================
// CHAMBER (Assemblée / Sénat)
// ============================================

export const CHAMBER_LABELS: Record<Chamber, string> = {
  AN: "Assemblée nationale",
  SENAT: "Sénat",
};

export const CHAMBER_SHORT_LABELS: Record<Chamber, string> = {
  AN: "AN",
  SENAT: "Sénat",
};

export const CHAMBER_COLORS: Record<Chamber, string> = {
  AN: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  SENAT:
    "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700",
};

// ============================================
// SCRUTIN TYPE (amendment/final/motion/article)
// ============================================

export const SCRUTIN_TYPE_LABELS: Record<ScrutinType, string> = {
  AMENDEMENT: "Amendement",
  FINAL: "Texte final",
  MOTION: "Motion",
  ARTICLE: "Article",
  AUTRE: "Autre",
};

export const SCRUTIN_TYPE_COLORS: Record<ScrutinType, string> = {
  FINAL: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  MOTION: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  ARTICLE: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  AMENDEMENT: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400",
  AUTRE: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400",
};

// ============================================
// LEGISLATIVE DOSSIERS
// ============================================

import type { DossierStatus, AmendmentStatus } from "@/generated/prisma";

export const DOSSIER_STATUS_LABELS: Record<DossierStatus, string> = {
  DEPOSE: "Déposé",
  EN_COMMISSION: "En commission",
  EN_COURS: "En discussion",
  CONSEIL_CONSTITUTIONNEL: "Conseil constitutionnel",
  ADOPTE: "Adopté",
  REJETE: "Rejeté",
  RETIRE: "Retiré",
  CADUQUE: "Caduc",
};

export const DOSSIER_STATUS_COLORS: Record<DossierStatus, string> = {
  DEPOSE:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  EN_COMMISSION:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  EN_COURS:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  CONSEIL_CONSTITUTIONNEL:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  ADOPTE:
    "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700",
  REJETE:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  RETIRE:
    "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700",
  CADUQUE:
    "bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-800/40 dark:text-stone-400 dark:border-stone-700",
};

export const DOSSIER_STATUS_ICONS: Record<DossierStatus, string> = {
  DEPOSE: "📋",
  EN_COMMISSION: "🔍",
  EN_COURS: "🔴",
  CONSEIL_CONSTITUTIONNEL: "⚖️",
  ADOPTE: "✅",
  REJETE: "❌",
  RETIRE: "⏸️",
  CADUQUE: "🕐",
};

export const DOSSIER_STATUS_DESCRIPTIONS: Record<DossierStatus, string> = {
  DEPOSE: "Texte déposé et renvoyé en commission, mais pas encore examiné.",
  EN_COMMISSION: "Rapport de commission rendu, en attente de passage en séance.",
  EN_COURS: "Texte en discussion active : séance publique, navette ou CMP.",
  CONSEIL_CONSTITUTIONNEL: "Texte soumis au Conseil constitutionnel.",
  ADOPTE: "Texte adopté définitivement et promulgué.",
  REJETE: "Texte rejeté par le Parlement.",
  RETIRE: "Texte retiré par son auteur.",
  CADUQUE: "Texte devenu caduc à la fin de la législature précédente.",
};

export const AMENDMENT_STATUS_LABELS: Record<AmendmentStatus, string> = {
  DEPOSE: "Déposé",
  ADOPTE: "Adopté",
  REJETE: "Rejeté",
  RETIRE: "Retiré",
  TOMBE: "Tombé",
};

export const AMENDMENT_STATUS_COLORS: Record<AmendmentStatus, string> = {
  DEPOSE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ADOPTE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  REJETE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  RETIRE: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  TOMBE: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400",
};

// Legislative categories with colors
export const DOSSIER_CATEGORY_COLORS: Record<string, string> = {
  Budget:
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
  Santé:
    "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700",
  Économie:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  Législation:
    "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700",
  Institutionnel:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  Constitution:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  International:
    "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700",
  Contrôle:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700",
  Information:
    "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700",
};

export const DOSSIER_CATEGORY_ICONS: Record<string, string> = {
  Budget: "💰",
  Santé: "🏥",
  Économie: "📊",
  Législation: "📜",
  Institutionnel: "🏛️",
  Constitution: "⚖️",
  International: "🌍",
  Contrôle: "🔍",
  Information: "📋",
};

// ============================================
// TIMELINE CHAMBERS (dossier legislative timeline)
// ============================================

export const TIMELINE_CHAMBER_COLORS: Record<string, string> = {
  AN: "bg-blue-500",
  SENAT: "bg-rose-500",
  CMP: "bg-purple-500",
  CC: "bg-amber-500",
  GOV: "bg-emerald-500",
  UNKNOWN: "bg-gray-400",
};

export const TIMELINE_CHAMBER_LABELS: Record<string, string> = {
  AN: "Assemblée nationale",
  SENAT: "Sénat",
  CMP: "Commission mixte paritaire",
  CC: "Conseil constitutionnel",
  GOV: "Gouvernement",
  UNKNOWN: "",
};

// ============================================
// THEME CATEGORIES (legislative dossiers & scrutins)
// ============================================

export const THEME_CATEGORY_LABELS: Record<ThemeCategory, string> = {
  ECONOMIE_BUDGET: "Économie & Budget",
  SOCIAL_TRAVAIL: "Social & Travail",
  SECURITE_JUSTICE: "Sécurité & Justice",
  ENVIRONNEMENT_ENERGIE: "Environnement & Énergie",
  SANTE: "Santé",
  EDUCATION_CULTURE: "Éducation & Culture",
  INSTITUTIONS: "Institutions",
  AFFAIRES_ETRANGERES_DEFENSE: "Affaires étrangères & Défense",
  NUMERIQUE_TECH: "Numérique & Tech",
  IMMIGRATION: "Immigration",
  AGRICULTURE_ALIMENTATION: "Agriculture & Alimentation",
  LOGEMENT_URBANISME: "Logement & Urbanisme",
  TRANSPORTS: "Transports",
};

export const THEME_CATEGORY_COLORS: Record<ThemeCategory, string> = {
  ECONOMIE_BUDGET:
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
  SOCIAL_TRAVAIL:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  SECURITE_JUSTICE:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  ENVIRONNEMENT_ENERGIE:
    "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700",
  SANTE:
    "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700",
  EDUCATION_CULTURE:
    "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700",
  INSTITUTIONS:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  AFFAIRES_ETRANGERES_DEFENSE:
    "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700",
  NUMERIQUE_TECH:
    "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700",
  IMMIGRATION:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700",
  AGRICULTURE_ALIMENTATION:
    "bg-lime-100 text-lime-800 border-lime-300 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-700",
  LOGEMENT_URBANISME:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  TRANSPORTS:
    "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700",
};

export const THEME_CATEGORY_ICONS: Record<ThemeCategory, string> = {
  ECONOMIE_BUDGET: "💰",
  SOCIAL_TRAVAIL: "👥",
  SECURITE_JUSTICE: "🔒",
  ENVIRONNEMENT_ENERGIE: "🌿",
  SANTE: "🏥",
  EDUCATION_CULTURE: "📚",
  INSTITUTIONS: "🏛️",
  AFFAIRES_ETRANGERES_DEFENSE: "🌍",
  NUMERIQUE_TECH: "💻",
  IMMIGRATION: "🛂",
  AGRICULTURE_ALIMENTATION: "🌾",
  LOGEMENT_URBANISME: "🏠",
  TRANSPORTS: "🚆",
};

export function dissidenceLabel(rate: number): string {
  if (rate < 5) return "Très discipliné";
  if (rate < 15) return "Discipliné";
  if (rate < 30) return "Modérément indépendant";
  return "Indépendant";
}

// ============================================
// ELECTIONS
// ============================================

export const ELECTION_TYPE_LABELS: Record<ElectionType, string> = {
  PRESIDENTIELLE: "Présidentielle",
  LEGISLATIVES: "Législatives",
  SENATORIALES: "Sénatoriales",
  MUNICIPALES: "Municipales",
  DEPARTEMENTALES: "Départementales",
  REGIONALES: "Régionales",
  EUROPEENNES: "Européennes",
  REFERENDUM: "Référendum",
};

export const ELECTION_TYPE_ICONS: Record<ElectionType, string> = {
  PRESIDENTIELLE: "🏛️",
  LEGISLATIVES: "🏛️",
  SENATORIALES: "🏛️",
  MUNICIPALES: "🏘️",
  DEPARTEMENTALES: "🗺️",
  REGIONALES: "🗺️",
  EUROPEENNES: "🇪🇺",
  REFERENDUM: "🗳️",
};

export const ELECTION_STATUS_LABELS: Record<ElectionStatus, string> = {
  UPCOMING: "À venir",
  REGISTRATION: "Inscriptions",
  CANDIDACIES: "Candidatures",
  CAMPAIGN: "Campagne",
  ROUND_1: "1er tour",
  BETWEEN_ROUNDS: "Entre-deux-tours",
  ROUND_2: "2nd tour",
  COMPLETED: "Terminée",
};

export const ELECTION_STATUS_COLORS: Record<ElectionStatus, string> = {
  UPCOMING:
    "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700",
  REGISTRATION:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  CANDIDACIES:
    "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700",
  CAMPAIGN:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  ROUND_1:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700",
  BETWEEN_ROUNDS:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
  ROUND_2:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
  COMPLETED:
    "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700",
};

export const ELECTION_SCOPE_LABELS: Record<ElectionScope, string> = {
  NATIONAL: "National",
  REGIONAL: "Régional",
  DEPARTMENTAL: "Départemental",
  MUNICIPAL: "Municipal",
  EUROPEAN: "Européen",
};

export const SUFFRAGE_TYPE_LABELS: Record<SuffrageType, string> = {
  DIRECT: "Suffrage universel direct",
  INDIRECT: "Suffrage indirect",
};

// ============================================
// PARTY LEADERSHIP TITLE SUGGESTIONS
// ============================================

export const PARTY_LEADERSHIP_TITLE_SUGGESTIONS: Record<string, string> = {
  RN: "Président(e)",
  LR: "Président(e)",
  RE: "Secrétaire général(e)",
  PS: "Premier(ère) secrétaire",
  EELV: "Secrétaire national(e)",
  PCF: "Secrétaire national(e)",
  LFI: "Coordinateur(trice)",
  MoDem: "Président(e)",
  REC: "Président(e)",
};

// ============================================
// NUANCES POLITIQUES (candidatures)
// ============================================

// Maps nuance codes (used in candidatures CSVs) to party shortName in our DB
// Includes both L-prefixed codes (municipales) and unprefixed codes (législatives 2024)
export const NUANCE_POLITIQUE_MAPPING: Record<string, string> = {
  // Extrême gauche
  LEXG: "LO", // Lutte Ouvrière
  EXG: "LO", // Extrême gauche (législatives 2024)
  LCOM: "PCF", // Parti communiste
  COM: "PCF", // Communiste (législatives 2024)
  LRDG: "PCF", // Régionalistes de gauche / ancienne étiquette
  LFI: "LFI", // La France Insoumise

  // Gauche
  LUG: "NFP", // Union de gauche → Nouveau Front Populaire
  UG: "NFP", // Union de la gauche / NFP (législatives 2024)
  LSOC: "PS", // Parti socialiste
  SOC: "PS", // Socialiste (législatives 2024)
  LDVG: "DVG", // Divers gauche
  DVG: "DVG", // Divers gauche (législatives 2024)
  DSV: "DVG", // Divers gauche variante (législatives 2024)
  LVEC: "EELV", // Écologistes
  LECO: "EELV", // Écologistes (variante)
  ECO: "EELV", // Écologiste (législatives 2024)
  LRG: "PRG", // Parti radical de gauche

  // Centre
  LREM: "RE", // Renaissance (ex-LREM)
  ENS: "RE", // Ensemble / macronistes (législatives 2024)
  LMC: "RE", // Majorité présidentielle
  LMDM: "MoDem", // MoDem
  HOR: "HOR", // Horizons (législatives 2024)
  LUDI: "UDI", // UDI
  UDI: "UDI", // UDI (législatives 2024)
  LUC: "UC", // Union centriste
  LDVC: "DVC", // Divers centre

  // Droite
  LLR: "LR", // Les Républicains
  LR: "LR", // Les Républicains (législatives 2024)
  LDVD: "DVD", // Divers droite
  DVD: "DVD", // Divers droite (législatives 2024)
  LUD: "LR", // Union de la droite

  // Extrême droite
  LRN: "RN", // Rassemblement National
  RN: "RN", // Rassemblement National (législatives 2024)
  LREC: "REC", // Reconquête
  REC: "REC", // Reconquête (législatives 2024)
  LEXD: "RN", // Extrême droite (générique)
  UXD: "RN", // Union extrême droite (législatives 2024)

  // Divers
  LDIV: "DIV", // Divers
  DIV: "DIV", // Divers (législatives 2024)
  LAUT: "DIV", // Autres
  REG: "REG", // Régionaliste (législatives 2024)
};

// ============================================
// PARTY ROLES
// ============================================

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  MEMBRE: "Membre",
  FONDATEUR: "Fondateur",
  PORTE_PAROLE: "Porte-parole",
  COORDINATEUR: "Coordinateur",
  PRESIDENT_HONNEUR: "Président d'honneur",
  SECRETAIRE_GENERAL: "Secrétaire général",
};

export const SIGNIFICANT_PARTY_ROLES: PartyRole[] = [
  "FONDATEUR",
  "PORTE_PAROLE",
  "COORDINATEUR",
  "PRESIDENT_HONNEUR",
  "SECRETAIRE_GENERAL",
];

export function feminizePartyRole(label: string, civility?: string | null): string {
  if (civility !== "Mme") return label;
  return label
    .replace("Fondateur", "Fondatrice")
    .replace("Coordinateur", "Coordinatrice")
    .replace("Président d'honneur", "Présidente d'honneur")
    .replace("Secrétaire général", "Secrétaire générale");
}

// ============================================
// FACT-CHECKS
// ============================================

export const FACTCHECK_RATING_LABELS: Record<FactCheckRating, string> = {
  TRUE: "Vrai",
  MOSTLY_TRUE: "Plutôt vrai",
  HALF_TRUE: "Partiellement vrai",
  MISLEADING: "Trompeur",
  OUT_OF_CONTEXT: "Hors contexte",
  MOSTLY_FALSE: "Plutôt faux",
  FALSE: "Faux",
  UNVERIFIABLE: "Invérifiable",
};

export const FACTCHECK_RATING_COLORS: Record<FactCheckRating, string> = {
  TRUE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  MOSTLY_TRUE: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  HALF_TRUE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  MISLEADING: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  OUT_OF_CONTEXT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  MOSTLY_FALSE: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  FALSE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  UNVERIFIABLE: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
};

export const FACTCHECK_RATING_DESCRIPTIONS: Record<FactCheckRating, string> = {
  TRUE: "L'affirmation est exacte et vérifiable par des sources fiables.",
  MOSTLY_TRUE: "L'affirmation est globalement exacte, avec des nuances mineures.",
  HALF_TRUE: "L'affirmation contient une part de vérité mais omet des éléments importants.",
  MISLEADING: "L'affirmation utilise des faits réels de manière trompeuse.",
  OUT_OF_CONTEXT: "L'affirmation sort des éléments de leur contexte d'origine.",
  MOSTLY_FALSE: "L'affirmation est en grande partie inexacte.",
  FALSE: "L'affirmation est contraire aux faits établis.",
  UNVERIFIABLE: "L'affirmation ne peut être vérifiée par les sources disponibles.",
};

/**
 * Whitelist of francophone fact-checking sources.
 * Non-francophone sources (Snopes, PolitiFact, Full Fact, Indian outlets, etc.)
 * are kept in DB but excluded from display queries.
 * Includes known name variants from the Google Fact Check API.
 */
export const FACTCHECK_ALLOWED_SOURCES = [
  "TF1 Info",
  "AFP Factuel",
  "Franceinfo",
  "20 Minutes",
  "Le Monde",
  "Libération",
  "Le Dauphiné Libéré",
  "Numerama",
  "DE FACTO",
  "Science Feedback",
  "RTBF",
  "Fasocheck",
];

/**
 * Detect if a fact-check claimant is a specific person (politician)
 * vs a generic source (social media, multiple sources, etc.)
 */
const GENERIC_CLAIMANT_PATTERNS = [
  "réseaux sociaux",
  "sources multiples",
  "sites internet",
  "publications",
  "utilisateurs",
  "internautes",
  "viral",
  "facebook",
  "twitter",
  "tiktok",
  "whatsapp",
  "telegram",
  "youtube",
  "instagram",
  "chaîne de mails",
  "rumeur",
  "blog",
  "forum",
];

export function isDirectPoliticianClaim(claimant: string | null): boolean {
  if (!claimant) return false;
  const lower = claimant.toLowerCase();
  return !GENERIC_CLAIMANT_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Verdict groups for stats aggregation (strict false = only FALSE + MOSTLY_FALSE)
export const VERDICT_GROUPS = {
  vrai: ["TRUE", "MOSTLY_TRUE"] as FactCheckRating[],
  trompeur: ["HALF_TRUE", "MISLEADING", "OUT_OF_CONTEXT"] as FactCheckRating[],
  faux: ["FALSE", "MOSTLY_FALSE"] as FactCheckRating[],
  inverifiable: ["UNVERIFIABLE"] as FactCheckRating[],
} as const;

export const VERDICT_GROUP_LABELS: Record<string, string> = {
  vrai: "Vrai / Plutôt vrai",
  trompeur: "Trompeur / Hors contexte",
  faux: "Faux / Plutôt faux",
  inverifiable: "Invérifiable",
};

export const VERDICT_GROUP_COLORS: Record<string, string> = {
  vrai: "#2d6a4f",
  trompeur: "#e9a825",
  faux: "#c1121f",
  inverifiable: "#6b7280",
};

// ============================================
// PHOTO SOURCES (admin forms)
// ============================================

export const PHOTO_SOURCES = [
  { value: "assemblee-nationale", label: "Assemblée nationale" },
  { value: "senat", label: "Sénat" },
  { value: "gouvernement", label: "Gouvernement" },
  { value: "hatvp", label: "HATVP" },
  { value: "nosdeputes", label: "NosDéputés.fr" },
  { value: "wikidata", label: "Wikidata" },
  { value: "manual", label: "Manuel" },
] as const;

// ---------------------------------------------------------------------------
// Publication Status
// ---------------------------------------------------------------------------

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  PUBLISHED: "Publié",
  DRAFT: "Brouillon",
  ARCHIVED: "Archivé",
  EXCLUDED: "Exclu",
  REJECTED: "Rejeté",
};

export const PUBLICATION_STATUS_STYLES: Record<PublicationStatus, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-300",
  DRAFT: "bg-amber-50 text-amber-700 border-amber-300",
  ARCHIVED: "bg-slate-50 text-slate-500 border-slate-300",
  EXCLUDED: "bg-red-50 text-red-600 border-red-300",
  REJECTED: "bg-red-50 text-red-600 border-red-300",
};

export const PUBLICATION_STATUS_OPTIONS: { value: PublicationStatus; label: string }[] = [
  { value: "PUBLISHED", label: "Publié" },
  { value: "DRAFT", label: "Brouillon" },
  { value: "ARCHIVED", label: "Archivé" },
  { value: "EXCLUDED", label: "Exclu" },
  { value: "REJECTED", label: "Rejeté" },
];

// ---------------------------------------------------------------------------
// Platform Update Types
// ---------------------------------------------------------------------------

export const PLATFORM_UPDATE_TYPE_LABELS: Record<PlatformUpdateType, string> = {
  DATA_IMPORT: "Import de données",
  NEW_FEATURE: "Nouveauté",
  IMPROVEMENT: "Amélioration",
  RELEASE: "Mise à jour",
};

export const PLATFORM_UPDATE_TYPE_ICONS: Record<PlatformUpdateType, string> = {
  DATA_IMPORT: "📦",
  NEW_FEATURE: "✨",
  IMPROVEMENT: "🔧",
  RELEASE: "🚀",
};

export const GROUP_POSITION_LABELS: Record<GroupPosition, string> = {
  POUR: "Pour",
  CONTRE: "Contre",
  ABSTENTION: "Abstention",
};

export const GROUP_POSITION_COLORS: Record<GroupPosition, string> = {
  POUR: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  CONTRE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  ABSTENTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

export const ANALYSIS_SOURCE_TYPE_LABELS: Record<AnalysisSourceType, string> = {
  DEBATE_TRANSCRIPT: "Débats parlementaires",
  STRUCTURED_DATA: "Données structurées",
};

// ---------------------------------------------------------------------------
// Thematic Axes (boussole politique)
// ---------------------------------------------------------------------------

export const THEMATIC_AXIS_LABELS: Record<ThematicAxis, string> = {
  ECONOMIC_ROLE: "Rôle économique de la puissance publique",
  SOCIETAL_NORMS: "Évolution des normes sociétales",
  ECOLOGICAL_TRANSITION: "Transition écologique et activité économique",
  SECURITY_LIBERTIES: "Équilibre sécurité / libertés",
  DEMOCRACY_INSTITUTIONS: "Organisation du pouvoir et participation citoyenne",
  EUROPEAN_INTEGRATION: "Construction européenne",
  IMMIGRATION: "Politique migratoire",
  FOREIGN_AFFAIRS: "Affaires internationales",
  URBAN_PLANNING: "Aménagement du territoire communal",
  PUBLIC_SERVICES: "Gestion des services publics locaux",
  MOBILITY: "Déplacements communaux",
};

export const THEMATIC_AXIS_POLE_A: Record<ThematicAxis, string> = {
  ECONOMIC_ROLE: "Intervention publique forte",
  SOCIETAL_NORMS: "Extension des droits individuels",
  ECOLOGICAL_TRANSITION: "Transformation rapide du modèle productif",
  SECURITY_LIBERTIES: "Renforcement des moyens de sécurité",
  DEMOCRACY_INSTITUTIONS: "Démocratie directe et contrôle citoyen",
  EUROPEAN_INTEGRATION: "Approfondissement de l'intégration",
  IMMIGRATION: "Politique d'accueil ouverte",
  FOREIGN_AFFAIRS: "Engagement multilatéral",
  URBAN_PLANNING: "Densification et ville compacte",
  PUBLIC_SERVICES: "Régie directe et maîtrise publique",
  MOBILITY: "Priorité mobilités actives et collectives",
};

export const THEMATIC_AXIS_POLE_B: Record<ThematicAxis, string> = {
  ECONOMIC_ROLE: "Initiative privée et allègement réglementaire",
  SOCIETAL_NORMS: "Préservation des cadres traditionnels",
  ECOLOGICAL_TRANSITION: "Adaptation progressive et innovation technologique",
  SECURITY_LIBERTIES: "Priorité aux garanties individuelles",
  DEMOCRACY_INSTITUTIONS: "Efficacité des institutions représentatives",
  EUROPEAN_INTEGRATION: "Réaffirmation de la souveraineté nationale",
  IMMIGRATION: "Maîtrise stricte des flux",
  FOREIGN_AFFAIRS: "Non-alignement et indépendance stratégique",
  URBAN_PLANNING: "Préservation du cadre de vie",
  PUBLIC_SERVICES: "Délégation et optimisation budgétaire",
  MOBILITY: "Maintien de l'accessibilité automobile",
};

export const THEMATIC_AXIS_SCOPE: Record<ThematicAxis, QuizElectionScope> = {
  ECONOMIC_ROLE: "COMMON",
  SOCIETAL_NORMS: "COMMON",
  ECOLOGICAL_TRANSITION: "COMMON",
  SECURITY_LIBERTIES: "COMMON",
  DEMOCRACY_INSTITUTIONS: "COMMON",
  EUROPEAN_INTEGRATION: "NATIONAL",
  IMMIGRATION: "NATIONAL",
  FOREIGN_AFFAIRS: "NATIONAL",
  URBAN_PLANNING: "MUNICIPAL",
  PUBLIC_SERVICES: "MUNICIPAL",
  MOBILITY: "MUNICIPAL",
};

export const QUIZ_ELECTION_SCOPE_LABELS: Record<QuizElectionScope, string> = {
  COMMON: "Tronc commun",
  NATIONAL: "National",
  MUNICIPAL: "Municipal",
};

// ============================================
// PROMISES (Tracker promesses 2027)
// ============================================

export const PROMISE_SOURCE_KIND_LABELS: Record<PromiseSourceKind, string> = {
  DISCOURS_AN: "Discours Assemblée nationale",
  DISCOURS_SENAT: "Discours Sénat",
  INTERVIEW_PRESSE: "Interview presse",
  ARTICLE_PRESSE: "Article presse",
  PROPOSITION_LOI: "Proposition de loi",
  PROGRAMME_PARTI: "Programme de parti",
  DECLARATION_PUBLIQUE: "Déclaration publique",
  AUTRE: "Autre",
};

export const PROMISE_EXTRACTION_STATUS_LABELS: Record<PromiseExtractionStatus, string> = {
  EXTRACTED: "Extraite (non revue)",
  PUBLISHED: "Publiée",
  REJECTED: "Rejetée",
  NEEDS_REVIEW: "À retraiter",
};
