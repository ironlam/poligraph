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
  CandidacyStatus,
} from "@/types";
import type {
  MeasureAttribution,
  MeasureExtractionMethod,
  MeasurePrecision,
  MeasureRejectionReason,
  MeasureReviewReadiness,
  MeasureReviewWarning,
  MeasureSourceKind,
  MeasureVoteLinkKind,
  MeasureVoteRelation,
  QualificationKind,
  SimilarityConclusion,
  SourceTier,
} from "@/generated/prisma";
import type {
  ModerationAnomalyCode,
  PublicationState,
  VisibilityBlocker,
} from "@/lib/measures/moderation-state";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import type { MeasureBadgeTier } from "@/components/measures/MeasureBadge";

// Nombre de sièges à l'Assemblée nationale (XVIIe législature)
export const AN_SEAT_COUNT = 577;

export const AFFAIR_STATUS_LABELS: Record<AffairStatus, string> = {
  ENQUETE_PRELIMINAIRE: "Enquête préliminaire",
  INSTRUCTION: "Instruction en cours",
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: "Instruction clôturée, sans mise en examen",
  MISE_EN_EXAMEN: "Mise en examen",
  RENVOI_TRIBUNAL: "Renvoi devant le tribunal",
  PROCES_EN_COURS: "Procès en cours",
  CONDAMNATION_PREMIERE_INSTANCE: "Condamnation (1ère instance)",
  APPEL_EN_COURS: "Appel en cours",
  POURVOI_EN_CASSATION: "Condamnation non définitive, pourvoi en cassation en cours",
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
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN:
    "bg-slate-100 text-slate-800 dark:bg-slate-800/50 dark:text-slate-300",
  MISE_EN_EXAMEN: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  RENVOI_TRIBUNAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  PROCES_EN_COURS: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  CONDAMNATION_PREMIERE_INSTANCE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  APPEL_EN_COURS: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  // Same shade as a first-instance conviction: two courts have convicted, but the
  // decision is not final, so it must not read as heavily as CONDAMNATION_DEFINITIVE.
  POURVOI_EN_CASSATION: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
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
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN:
    "L'instruction est terminée sans qu'aucune mise en examen ait été prononcée. Le parquet doit encore rendre ses réquisitions et aucune ordonnance n'a été rendue.",
  MISE_EN_EXAMEN:
    "Le juge considère qu'il existe des indices graves contre la personne. Ce n'est pas une condamnation.",
  RENVOI_TRIBUNAL: "Le juge a considéré les charges suffisantes pour un procès devant le tribunal.",
  PROCES_EN_COURS: "L'affaire est actuellement jugée devant un tribunal.",
  CONDAMNATION_PREMIERE_INSTANCE:
    "Le tribunal a prononcé une condamnation, mais un appel est encore possible.",
  APPEL_EN_COURS: "La décision du tribunal est contestée devant la cour d'appel.",
  POURVOI_EN_CASSATION:
    "La cour d'appel a condamné, et un pourvoi en cassation a été formé. La condamnation n'est pas définitive : la Cour de cassation peut encore l'annuler.",
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
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: true,
  MISE_EN_EXAMEN: true,
  RENVOI_TRIBUNAL: true,
  PROCES_EN_COURS: true,
  CONDAMNATION_PREMIERE_INSTANCE: true, // Can still appeal
  APPEL_EN_COURS: true,
  POURVOI_EN_CASSATION: true, // Cassation can still quash the conviction
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

// ============================================
// MEASURE VOTE RELATION (VoteRelationBadge, spec §9.2)
// ============================================

// Two axes, one label each, per the nine states of deriveVoteRelation(). The position axis is short and
// null when there is nothing to assert. The basis axis is always present.
export const VOTE_RELATION_POSITION_LABELS: Record<VoteRelation, string | null> = {
  FAVORABLE_SAME_OBJECT: "Pour",
  DEFAVORABLE_SAME_OBJECT: "Contre",
  ABSTENTION_SAME_OBJECT: "Abstention",
  ABSENCE_SAME_OBJECT: "Absence",
  DIFFERENT_POSITIONS: "Positions différentes",
  BROADER_TEXT: null,
  NOT_RECHECKED_SINCE_REFORMULATION: null,
  NO_VOTE_IN_SCOPE: null,
  SEARCH_NOT_DONE: null,
};

// Each basis names its own subject, parliamentary votes, and says where the verification stands in
// words a reader meets nowhere else on the page. The previous wording was written from the inside:
// "périmètre non examiné" and "périmètre examiné sans résultat" name an editorial workflow, not a
// fact about the measure, and sitting next to a precision pill they read as a second qualification
// of the sentence rather than as the state of our work. "Périmètre" also carried the whole
// distinction between the two while being the one word in the pair a reader cannot resolve from the
// page. The two search states now share a prefix and differ only in their tail, "à vérifier" against
// "vérifié", which is also the verb the sourced detail already uses ("vérifié le ..."). What that
// verification is, and that it is ongoing, is stated once by the legend above the comparison rather
// than crammed into a label repeated under every measure. The nine states are unchanged; only what
// they say is.
export const VOTE_RELATION_BASIS_LABELS: Record<VoteRelation, string> = {
  FAVORABLE_SAME_OBJECT: "Vote sur le même objet",
  DEFAVORABLE_SAME_OBJECT: "Vote sur le même objet",
  ABSTENTION_SAME_OBJECT: "Vote sur le même objet",
  ABSENCE_SAME_OBJECT: "Vote sur le même objet",
  DIFFERENT_POSITIONS: "Plusieurs votes sur le même objet",
  BROADER_TEXT: "Vote sur un texte plus large",
  NOT_RECHECKED_SINCE_REFORMULATION: "Mesure reformulée depuis, vote à revérifier",
  NO_VOTE_IN_SCOPE: "Vote au Parlement vérifié, aucun scrutin proche",
  SEARCH_NOT_DONE: "Vote au Parlement à vérifier",
};

// Which weight of `MeasureBadge` each state gets. The tier encodes importance, not category: a
// recorded position is the strongest fact the page states, a vote found on a broader text is a
// finding, and the last three describe where our own verification stands and appear under nearly
// every measure, so they take the quietest form the family has.
export const VOTE_RELATION_BADGE_TIER: Record<VoteRelation, MeasureBadgeTier> = {
  FAVORABLE_SAME_OBJECT: "verdict",
  DEFAVORABLE_SAME_OBJECT: "verdict",
  ABSTENTION_SAME_OBJECT: "verdict",
  ABSENCE_SAME_OBJECT: "verdict",
  DIFFERENT_POSITIONS: "verdict",
  BROADER_TEXT: "qualification",
  NOT_RECHECKED_SINCE_REFORMULATION: "verification",
  NO_VOTE_IN_SCOPE: "verification",
  SEARCH_NOT_DONE: "verification",
};

// Solid fill, white text. Hex values are the AA-verified variants of spec §9.2 (ratios >= 4,5:1 on white
// text): #3d7a4e (5,13), #9e5454 (5,45), #6b7078 (4,98). Read only for the states that carry a position
// pill; empty for the others, which take their form from VOTE_RELATION_BADGE_TIER instead.
export const VOTE_RELATION_PILL_CLASS: Record<VoteRelation, string> = {
  FAVORABLE_SAME_OBJECT: "bg-[#3d7a4e] text-white",
  DEFAVORABLE_SAME_OBJECT: "bg-[#9e5454] text-white",
  ABSTENTION_SAME_OBJECT: "bg-[#6b7078] text-white",
  ABSENCE_SAME_OBJECT: "bg-[#6b7078] text-white",
  DIFFERENT_POSITIONS: "bg-[#6b7078] text-white",
  BROADER_TEXT: "",
  NOT_RECHECKED_SINCE_REFORMULATION: "",
  NO_VOTE_IN_SCOPE: "",
  SEARCH_NOT_DONE: "",
};

// The reviewer-recorded relation of the candidate to the measure on an identified scrutin (raw
// MeasureVoteRelation, spec §5.8), for the admin attachment screen. ABSENCE means "an existing scrutin
// on the same object, in which the person did not take part": it is a relation on a chosen scrutin,
// never "no scrutin found". That other case is a MeasureVoteLinkKind (NO_VOTE_IDENTIFIED), not a relation.
export const MEASURE_VOTE_RELATION_LABELS: Record<MeasureVoteRelation, string> = {
  FAVORABLE: "Favorable à la mesure",
  DEFAVORABLE: "Défavorable à la mesure",
  ABSTENTION: "Abstention",
  ABSENCE: "Absent(e) au scrutin",
};

// The object relationship between a scrutin and the measure (MeasureVoteLinkKind, spec §5.8).
export const MEASURE_VOTE_LINK_KIND_LABELS: Record<MeasureVoteLinkKind, string> = {
  SAME_OBJECT: "Scrutin sur le même objet que la mesure",
  BROADER_TEXT: "Scrutin sur un texte plus large contenant la mesure",
  NO_VOTE_IDENTIFIED: "Aucun scrutin pertinent trouvé dans le périmètre",
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
  ADOPTE: "Texte adopté définitivement par le Parlement, lorsque cette information est disponible.",
  REJETE: "Texte rejeté par le Parlement.",
  RETIRE: "Texte retiré par son auteur.",
  CADUQUE: "Texte devenu caduc à la fin de la législature précédente.",
};

// Plain-language "where it stands" sentences for dossier cards. Derived solely
// from DossierStatus: never asserts a sub-step (séance, navette, CMP) or an
// outcome (promulgation) that the data does not actually carry.
export const DOSSIER_STATUS_SITUATIONS: Record<DossierStatus, string> = {
  DEPOSE: "Déposé : le texte est enregistré, mais pas forcément encore examiné.",
  EN_COMMISSION: "En commission : le texte est préparé ou examiné avant un éventuel débat public.",
  EN_COURS: "En discussion active : le texte poursuit son parcours parlementaire.",
  CONSEIL_CONSTITUTIONNEL:
    "Au Conseil constitutionnel : le texte fait l'objet d'un contrôle avant promulgation éventuelle.",
  ADOPTE: "Adopté : les données indiquent que le Parlement a terminé l'examen du texte.",
  REJETE: "Rejeté : le texte n'a pas été adopté.",
  RETIRE: "Retiré : le texte a été retiré par son auteur ou son initiateur.",
  CADUQUE: "Caduc : le texte n'est plus poursuivi dans la procédure actuelle.",
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
  ECONOMIE_BUDGET: "Économie et budget",
  SOCIAL_TRAVAIL: "Questions sociales et travail",
  EMPLOI_TRAVAIL: "Emploi et travail",
  RETRAITES: "Retraites",
  SOLIDARITES_PROTECTION_SOCIALE: "Solidarités et protection sociale",
  SOCIETE_DROITS_LIBERTES: "Société, droits et libertés",
  SECURITE_JUSTICE: "Sécurité et justice",
  ENVIRONNEMENT_ENERGIE: "Environnement et énergie",
  SANTE: "Santé",
  EDUCATION_CULTURE: "Éducation et culture",
  INSTITUTIONS: "Institutions",
  AFFAIRES_ETRANGERES_DEFENSE: "Affaires étrangères et défense",
  NUMERIQUE_TECH: "Numérique et technologies",
  IMMIGRATION: "Immigration",
  AGRICULTURE_ALIMENTATION: "Agriculture et alimentation",
  LOGEMENT_URBANISME: "Logement et urbanisme",
  TRANSPORTS: "Transports",
};

export const THEME_CATEGORY_COLORS: Record<ThemeCategory, string> = {
  ECONOMIE_BUDGET:
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
  SOCIAL_TRAVAIL:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  EMPLOI_TRAVAIL:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700",
  RETRAITES:
    "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 dark:border-fuchsia-700",
  SOLIDARITES_PROTECTION_SOCIALE:
    "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700",
  SOCIETE_DROITS_LIBERTES:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
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

/**
 * The same hues as THEME_CATEGORY_COLORS, solid rather than tinted, for the accent bar the
 * subject page puts before a theme in its navigation and before a candidate in its table.
 *
 * A separate map and not a derivation: the badge palette pairs a 100-level background with an
 * 800-level text, and there is no rule that turns that pair into the single 500/600 fill an accent
 * bar needs. Deriving it by string surgery on Tailwind class names would break silently the day a
 * badge shade moves.
 *
 * Purely decorative wherever it is used: the theme is always named in text beside it, so the bar
 * carries no information of its own and is `aria-hidden`.
 */
export const THEME_ACCENT_BAR: Record<ThemeCategory, string> = {
  LOGEMENT_URBANISME: "bg-amber-500",
  SANTE: "bg-rose-600",
  SOCIAL_TRAVAIL: "bg-violet-600",
  EMPLOI_TRAVAIL: "bg-violet-600",
  RETRAITES: "bg-fuchsia-600",
  SOLIDARITES_PROTECTION_SOCIALE: "bg-pink-600",
  SOCIETE_DROITS_LIBERTES: "bg-blue-600",
  ECONOMIE_BUDGET: "bg-emerald-600",
  ENVIRONNEMENT_ENERGIE: "bg-green-600",
  SECURITE_JUSTICE: "bg-red-600",
  EDUCATION_CULTURE: "bg-indigo-600",
  IMMIGRATION: "bg-orange-600",
  TRANSPORTS: "bg-teal-600",
  AGRICULTURE_ALIMENTATION: "bg-lime-600",
  NUMERIQUE_TECH: "bg-sky-600",
  AFFAIRES_ETRANGERES_DEFENSE: "bg-cyan-600",
  INSTITUTIONS: "bg-purple-600",
};

export const THEME_CATEGORY_ICONS: Record<ThemeCategory, string> = {
  ECONOMIE_BUDGET: "💰",
  SOCIAL_TRAVAIL: "👥",
  EMPLOI_TRAVAIL: "💼",
  RETRAITES: "🕰️",
  SOLIDARITES_PROTECTION_SOCIALE: "🤝",
  SOCIETE_DROITS_LIBERTES: "⚖️",
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
 *
 * One canonical label per outlet: the spelling variants the Google Fact Check
 * API returns are folded onto these labels by canonicalizeFactCheckSource()
 * before anything is stored or compared.
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
 * Google returns a publisher's name as that publisher spells it in its own
 * ClaimReview markup, and the spelling drifts over time: the same outlet
 * arrives as "Franceinfo" then "franceinfo", "DE FACTO" then "De Facto",
 * "AFP Factuel" then "Factuel AFP". Comparing the raw string against
 * FACTCHECK_ALLOWED_SOURCES sent those reviews to DRAFT and kept them out of
 * every public listing, which is what froze the public fact-check feed on its
 * April 2026 entry while the sync kept importing.
 *
 * Case and accents are folded, so only spellings that differ by more than that
 * need an entry here.
 */
const FACTCHECK_SOURCE_ALIASES: Record<string, string> = {
  // AFP's French desk (factuel.afp.com), whose two words Google returns in
  // either order. Its English desk publishes under "AFP Fact Check" and is
  // deliberately absent: those reviews are in English, and the one moderation
  // decision recorded on a fact-check unpublished exactly such a review.
  "Factuel AFP": "AFP Factuel",
};

/** Case-, accent- and punctuation-insensitive key for one publisher name. */
function factCheckSourceKey(source: string): string {
  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CANONICAL_FACTCHECK_SOURCES = new Map<string, string>([
  ...FACTCHECK_ALLOWED_SOURCES.map((label) => [factCheckSourceKey(label), label] as const),
  ...Object.entries(FACTCHECK_SOURCE_ALIASES).map(
    ([variant, label]) => [factCheckSourceKey(variant), label] as const
  ),
]);

/**
 * Fold a publisher name onto its canonical label. Unknown publishers are
 * returned as they came (whitespace-tidied only): the allow-list, not this
 * function, decides what is publishable.
 */
export function canonicalizeFactCheckSource(source: string): string {
  const tidied = source.trim().replace(/\s+/g, " ");
  return CANONICAL_FACTCHECK_SOURCES.get(factCheckSourceKey(tidied)) ?? tidied;
}

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

// Pre-campaign candidacy status. Before official filing, no one is formally a candidate:
// the four levels must stay distinguishable so a rumour is never rendered as an announcement.
export const CANDIDACY_STATUS_LABELS: Record<CandidacyStatus, string> = {
  DECLARE: "Candidature annoncée",
  PRESSENTI: "Personnalité pressentie",
  ENVISAGE: "Personnalité évoquée",
  RETIRE: "Candidature retirée",
};

/**
 * The same four levels, without the noun, for the merged status + programme badge.
 *
 * The badge reads "Annoncée · 19 mesures" in a 230px column: repeating "Candidature" in a list
 * whose column is titled "Candidature" would cost a third of the width to say nothing. The
 * adjectives agree with "candidature", so the short form states no gender for the person, which
 * is the same reason `candidacyRoleLabel` has a neutral branch.
 */
export const CANDIDACY_STATUS_SHORT_LABELS: Record<CandidacyStatus, string> = {
  DECLARE: "Annoncée",
  PRESSENTI: "Pressentie",
  ENVISAGE: "Évoquée",
  RETIRE: "Retirée",
};

/**
 * The candidacy notice's title is a ROLE, so it agrees in gender with `civility`.
 *
 * Not routed through `feminizePartyRole`: that helper is a closed replacement table over four party
 * role labels and "Candidat" is not one of them. Extending it would make it a general feminiser it
 * was never designed to be.
 *
 * The third branch is the one the mockup does not cover. `Politician.civility` is null on 5 of the
 * 25 sourced presidential candidacies, and falling back to the masculine would state a gender the
 * database does not hold, on a real person's fiche. The neutral form agrees with "candidature", a
 * feminine noun, and says nothing about the person, which is what the notice already does in its
 * withdrawn state.
 */
export function candidacyRoleLabel(civility: string | null | undefined): string {
  if (civility === "Mme") return "Candidate à la présidentielle";
  if (civility === "M.") return "Candidat à la présidentielle";
  return "Candidature à la présidentielle";
}

/**
 * Title of the notice for a candidacy the press mentions and nobody declared.
 *
 * Same three branches and the same reason: "Cité" is a past participle that agrees with the person,
 * so the mockup's single wording would print "Cité" on a woman's fiche. The neutral branch drops the
 * participle rather than guessing.
 */
export function candidacyPossibleLabel(civility: string | null | undefined): string {
  if (civility === "Mme") return "Citée parmi les candidatures possibles";
  if (civility === "M.") return "Cité parmi les candidatures possibles";
  return "Parmi les candidatures possibles";
}

// ---------------------------------------------------------------------------
// Mesures : le modèle éditorial versionné du hub présidentielle (lot 1 et 2).
// ---------------------------------------------------------------------------

export const MEASURE_ATTRIBUTION_LABELS: Record<MeasureAttribution, string> = {
  PERSONAL: "Formulée personnellement",
  PARTY_PROGRAM: "Reprise du programme du parti",
};

export const MEASURE_PRECISION_LABELS: Record<MeasurePrecision, string> = {
  CHIFFREE: "Objectif quantifié",
  OBJECTIF_SANS_CHIFFRE: "Objectif non quantifié",
};

// Deliberately NOT a green/amber pair. A traffic light reads as a verdict, and a measure carrying a
// figure is not a better measure than one stating an objective: it is a different kind of statement,
// and grading it would be the ranking this site does not do. Same neutral slate as the vote
// relations that state no position, distinguished by weight rather than by hue.
export const MEASURE_EXTRACTION_METHOD_LABELS: Record<MeasureExtractionMethod, string> = {
  MANUAL: "Saisie manuelle",
  AI_ASSISTED: "Assistée par IA",
  IMPORTED: "Importée",
};

export const MEASURE_REVIEW_READINESS_LABELS: Record<MeasureReviewReadiness, string> = {
  READY_FOR_REVIEW: "Prête pour revue technique",
  REVIEW_WITH_WARNING: "Revue avec attention requise",
};

export const MEASURE_REVIEW_WARNING_LABELS: Record<MeasureReviewWarning, string> = {
  POSSIBLE_DIAGNOSIS_AS_ACTION: "Possible diagnostic transformé en action",
  POSSIBLE_EXISTING_POLICY: "Possible politique existante",
  ATTRIBUTION_UNCERTAIN: "Attribution discursive incertaine",
  POSSIBLE_DUPLICATE: "Doublon possible",
  OBJECTIVE_VS_MEASURE_UNCERTAIN: "Classification mesure ou objectif incertaine",
  WORDING_NEEDS_REVIEW: "Formulation à revoir",
  EVIDENCE_SCOPE_WEAK: "Périmètre de preuve à examiner",
  MODEL_LOW_CONFIDENCE: "Confiance du modèle moyenne ou faible",
};

export const MEASURE_REJECTION_REASON_LABELS: Record<MeasureRejectionReason, string> = {
  NOT_A_PROPOSAL: "Pas une proposition",
  DIAGNOSIS_ONLY: "Diagnostic seul",
  THIRD_PARTY: "Proposition d'un tiers",
  EXISTING_POLICY: "Politique existante",
  HISTORICAL: "Élément historique",
  DUPLICATE: "Doublon",
  INSUFFICIENT_EVIDENCE: "Preuve insuffisante",
  BAD_WORDING: "Formulation inadéquate",
  OTHER: "Autre",
};

export const MEASURE_SOURCE_KIND_LABELS: Record<MeasureSourceKind, string> = {
  PROGRAMME_PARTI: "Programme de parti",
  PROGRAMME_CANDIDAT: "Programme de candidature",
  PROPOSITIONS_CANDIDAT: "Propositions de candidature",
  DISCOURS_CAMPAGNE: "Discours de campagne",
  DEBAT_TELEVISE: "Débat télévisé",
  DISCOURS_AN: "Discours à l'Assemblée nationale",
  DISCOURS_SENAT: "Discours au Sénat",
  INTERVIEW_PRESSE: "Interview de presse",
  ARTICLE_PRESSE: "Article de presse",
  PROPOSITION_LOI: "Proposition de loi",
};

export const SOURCE_TIER_LABELS: Record<SourceTier, string> = {
  PRIMARY: "Source primaire",
  SECONDARY: "Source secondaire",
};

// Les quatre qualificatifs opposables. Leurs définitions complètes, avec leur cas limite,
// vivent dans docs/editorial/qualifications-mesures.md.
export const QUALIFICATION_KIND_LABELS: Record<QualificationKind, string> = {
  FINANCEMENT_NON_PRECISE: "Financement non précisé",
  DEJA_TENTEE: "Déjà tentée",
  CALENDRIER_PRECISE: "Calendrier précisé",
  PERIMETRE_INCERTAIN: "Périmètre incertain",
};

// L'étape du cycle éditorial, dérivée. Distincte de PUBLICATION_STATUS_LABELS, qui nomme la
// colonne : une mesure peut être déclarée PUBLISHED sans être visible du public.
export const PUBLICATION_STATE_LABELS: Record<PublicationState, string> = {
  EMPTY: "Sans révision",
  DRAFT: "Brouillon",
  REVIEWED: "Relue",
  PUBLISHED: "Publiée",
  DEPUBLISHED: "Dépubliée",
};

// Le vocabulaire est celui de measures:audit. Chaque libellé dit ce qui est cassé, pas
// seulement qu'il y a un problème : un relecteur doit pouvoir agir.
export const MODERATION_ANOMALY_LABELS: Record<ModerationAnomalyCode, string> = {
  published_revision_foreign: "La révision publiée n'appartient pas à cette mesure",
  published_revision_unreviewed: "La révision publiée n'a pas été relue",
  published_revision_unpublished: "La révision pointée n'a jamais été publiée",
  published_revision_superseded: "La révision publiée a été remplacée",
  published_revision_without_source: "La révision publiée n'a plus aucune source",
  published_revision_discarded: "La révision publiée a été abandonnée",
  published_without_revision: "Statut publié sans aucune révision désignée",
  depublished_without_reason: "Dépubliée sans motif enregistré",
  multiple_published_revisions: "Deux révisions publiées et non remplacées",
  orphan_active_draft: "Un brouillon actif qu'aucun pointeur ne désigne",
  latest_revision_foreign: "Le pointeur de brouillon désigne une autre mesure",
  latest_revision_discarded: "Le pointeur de brouillon désigne un brouillon abandonné",
  withdrawn_without_source: "Retrait sans source : ni URL ni libellé",
  withdrawal_source_without_date: "Source de retrait sans date de retrait",
};

// Pourquoi le public ne voit pas une mesure. Distinct des anomalies : une dépublication est
// une raison sans être un défaut de données.
export const VISIBILITY_BLOCKER_LABELS: Record<VisibilityBlocker, string> = {
  status_not_published: "La mesure n'est pas au statut publié",
  no_published_pointer: "Aucune révision n'est désignée comme publiée",
  pointer_not_found: "La révision désignée est introuvable",
  revision_unreviewed: "La révision désignée n'a pas été relue",
  revision_never_published: "La révision désignée n'a jamais été publiée",
  revision_superseded: "La révision désignée a été remplacée",
  revision_discarded: "La révision désignée a été abandonnée",
  revision_without_source: "La révision désignée n'a aucune source",
};

export const SIMILARITY_CONCLUSION_LABELS: Record<SimilarityConclusion, string> = {
  NO_EQUIVALENT_FOUND: "Aucun équivalent trouvé",
  EQUIVALENT_FOUND: "Équivalent trouvé",
  INCONCLUSIVE: "Non concluant",
};
