import type { ExtractedProposal } from "../../types";

export type PrecisionHumanDecision = "ACCEPT_MEASURE" | "ACCEPT_OBJECTIVE" | "REJECT";

export type PrecisionEditorialReason =
  | "EXPLICIT_ACTION"
  | "EXPLICIT_TARGET_WITHOUT_MEANS"
  | "TITLE_ONLY"
  | "SLOGAN"
  | "VALUE"
  | "DIAGNOSIS"
  | "HISTORICAL_ACTION"
  | "THIRD_PARTY_PROPOSAL"
  | "EXISTING_POLICY_DESCRIPTION"
  | "RHETORICAL_FORMULATION"
  | "INSUFFICIENT_ATTRIBUTION"
  | "GENERAL_INTENT"
  | "OTHER";

export type PrecisionRiskCategory =
  | "EXPLICIT_ACTION"
  | "QUANTIFIED_ACTION"
  | "OBJECTIVE_WITHOUT_MEANS"
  | "TITLE"
  | "SLOGAN"
  | "VALUE"
  | "DIAGNOSIS"
  | "HISTORICAL"
  | "THIRD_PARTY"
  | "EXISTING_POLICY"
  | "RHETORICAL"
  | "ATTRIBUTION"
  | "GENERAL_INTENT"
  | "SHORT_LIST_ITEM"
  | "PARSER_GROUNDING"
  | "OTHER";

export type RuffinPrecisionEntry = {
  id: string;
  sourceText: string;
  normalizedText: string | null;
  documentUrl: string;
  page: number | null;
  heading: string | null;
  modelClassification: ExtractedProposal["classification"];
  pipelineClassification: ExtractedProposal["classification"];
  pipelineAccepted: boolean;
  humanDecision: PrecisionHumanDecision;
  editorialReason: PrecisionEditorialReason;
  riskCategory: PrecisionRiskCategory;
  snapshot: "CALIBRATED_PARTIAL_2026-08-15" | "PRECALIBRATION_FULL_2026-08-15";
};

// Échantillon déterministe annoté à partir des sorties réelles Ruffin.
// Les annotations humaines décrivent le texte source et ne doivent pas être ajustées aux métriques.
export const RUFFIN_PRECISION_SET: RuffinPrecisionEntry[] = [
  {
    id: "calibrated-accepted-0",
    sourceText: "POUR UN STATUT DES TRAVAILLEUSES & TRAVAILLEURS ESSENTIELS",
    normalizedText: "POUR UN STATUT DES TRAVAILLEUSES & TRAVAILLEURS ESSENTIELS",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 1,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-1",
    sourceText: "qu’ils puissent bien le vivre et non en souffrir",
    normalizedText: "qu’ils puissent bien le vivre et non en souffrir",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 2,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "INSUFFICIENT_ATTRIBUTION",
    riskCategory: "ATTRIBUTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-2",
    sourceText:
      "IL EST GRAND TEMPS DE LEUR DONNER UN VÉRITABLE STATUT ET DE CHANGER LA VIE DE CES MILLIONS DE TRAVAILLEUSES ET TRAVAILLEURS ESSENTIELS.",
    normalizedText: "Donner un véritable statut aux travailleuses et travailleurs essentiels.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 3,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-3",
    sourceText: "INVERSONS LA HIÉRARCHIE DES SALAIRES !",
    normalizedText: "Inverser la hiérarchie des salaires",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 6,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-4",
    sourceText:
      "notre  PROJET  RECONNAÎTRE UN STATUT  DES TRAVAILLEUSES  ET TRAVAILLEURS  ESSENTIELS",
    normalizedText:
      "notre  PROJET  RECONNAÎTRE UN STATUT  DES TRAVAILLEUSES  ET TRAVAILLEURS  ESSENTIELS",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 10,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-5",
    sourceText: "des heures invisibles enfin payées",
    normalizedText: "des heures invisibles enfin payées",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 10,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-6",
    sourceText: "des journées à trous et des temps partiels subis qui cessent d’être la norme",
    normalizedText: "des journées à trous et des temps partiels subis qui cessent d’être la norme",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 10,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-7",
    sourceText: "une pénibilité qui compte dans la carrière et pour la retraite",
    normalizedText: "une pénibilité qui compte dans la carrière et pour la retraite",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 10,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-8",
    sourceText:
      "Nous voulons aussi que les employeurs assument enfin le coût social de leurs choix économiques.",
    normalizedText:
      "Nous voulons aussi que les employeurs assument enfin le coût social de leurs choix économiques.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 13,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "GENERAL_INTENT",
    riskCategory: "GENERAL_INTENT",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-9",
    sourceText:
      "Sur le modèle du principe « pollueur-payeur », nous défendons le principe du « broyeur-payeur » afin d’augmenter le coût du mal-travail pour tous les employeurs qui imposent des conditions de travail dégradées.",
    normalizedText:
      "Sur le modèle du principe « pollueur-payeur », nous défendons le principe du « broyeur-payeur » afin d’augmenter le coût du mal-travail pour tous les employeurs qui imposent des conditions de travail dégradées.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 13,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-10",
    sourceText: "ces entreprises doivent payer au prix fort les efforts de leurs salariés.",
    normalizedText: "ces entreprises doivent payer au prix fort les efforts de leurs salariés.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 13,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-11",
    sourceText: "« QUE LES EMPLOYEURS ASSUMENT ENFIN LE COÛT SOCIAL DE LEURS CHOIX ÉCONOMIQUES. »",
    normalizedText:
      "« QUE LES EMPLOYEURS ASSUMENT ENFIN LE COÛT SOCIAL DE LEURS CHOIX ÉCONOMIQUES. »",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 13,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-12",
    sourceText:
      "Mieux payer celles et ceux qui prennent soin, qui accompagnent, qui nettoient, qui nourrissent.",
    normalizedText:
      "Mieux payer celles et ceux qui prennent soin, qui accompagnent, qui nettoient, qui nourrissent.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 14,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-13",
    sourceText: "Mettre fin aux journées hachées et aux horaires impossibles.",
    normalizedText: "Mettre fin aux journées hachées et aux horaires impossibles.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 14,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-14",
    sourceText:
      "Reconnaître la pénibilité, accorder des trimestres supplémentaires pour la retraite, ouvrir de vraies possibilités de formation et de reconversion.",
    normalizedText:
      "Reconnaître la pénibilité, accorder des trimestres supplémentaires pour la retraite, ouvrir de vraies possibilités de formation et de reconversion.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 14,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-15",
    sourceText: "Encadrer le recours à l’intérim et aux CDD.",
    normalizedText: "Encadrer le recours à l’intérim et aux CDD.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 14,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-16",
    sourceText:
      "Permettre de se loger près de son travail, pour préserver sa santé et sa vie familiale.",
    normalizedText:
      "Permettre de se loger près de son travail, pour préserver sa santé et sa vie familiale.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 14,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-17",
    sourceText:
      "Les branches professionnelles doivent tout d’abord mettre en conformité les minima salariaux de leurs grilles avec le SMIC.",
    normalizedText:
      "Mettre en conformité les minima salariaux des grilles des branches professionnelles avec le SMIC.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 15,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-18",
    sourceText:
      "Ensuite, elles doivent revaloriser et revoir ces grilles pour permettre plus de progression.",
    normalizedText:
      "Ensuite, elles doivent revaloriser et revoir ces grilles pour permettre plus de progression.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 15,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-19",
    sourceText:
      "LUTTER CONTRE LES HORAIRES ATYPIQUES EN RÉMUNÉRANT DOUBLE LES HEURES AVANT 8 H ET APRÈS 18 H.",
    normalizedText:
      "LUTTER CONTRE LES HORAIRES ATYPIQUES EN RÉMUNÉRANT DOUBLE LES HEURES AVANT 8 H ET APRÈS 18 H.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 16,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-20",
    sourceText:
      "Il nous faut ainsi protéger ces travailleuses et travailleurs en créant une nouvelle catégorie d’horaires dans le code du travail, et instaurer une majoration significative pour les heures réalisées en horaires atypiques pour dissuader les employeurs d’y recourir, lorsque cette organisation n’est pas justifiée par la continuité du service.",
    normalizedText:
      "Il nous faut ainsi protéger ces travailleuses et travailleurs en créant une nouvelle catégorie d’horaires dans le code du travail, et instaurer une majoration significative pour les heures réalisées en horaires atypiques pour dissuader les employeurs d’y recourir, lorsque cette organisation n’est pas justifiée par la continuité du service.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 16,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-21",
    sourceText: "NOUS DEVONS ENCADRER LES HORAIRES ATYPIQUES COMME LE TRAVAIL DE NUIT.",
    normalizedText: "NOUS DEVONS ENCADRER LES HORAIRES ATYPIQUES COMME LE TRAVAIL DE NUIT.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 16,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-22",
    sourceText: "METTRE FIN AUX TEMPS PARTIELS SUBIS PAR LES SALARIÉS ESSENTIELS.",
    normalizedText: "Mettre fin aux temps partiels subis par les salariés essentiels.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 18,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-23",
    sourceText: "il faudrait une prise en compte de l’amplitude horaire",
    normalizedText: "il faudrait une prise en compte de l’amplitude horaire",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 19,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "THIRD_PARTY_PROPOSAL",
    riskCategory: "THIRD_PARTY",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-24",
    sourceText:
      "L’argent des OPCO sera orienté, en priorité, vers la formation des salariés essentiels, afin d’inverser ce que l’on observe aujourd’hui, à savoir que ce sont surtout les plus diplômés qui bénéficient de la formation professionnelle.",
    normalizedText:
      "Orienter en priorité l’argent des OPCO vers la formation des salariés essentiels.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 20,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-25",
    sourceText:
      "Nous voulons réformer le dispositif actuel de prise en compte de la pénibilité dans le calcul des droits à la retraite, en sortant de la logique individuelle du C3P et en lui substituant l’octroi automatique de trimestres supplémentaires : pour quatre trimestres cotisés dans un métier exposé à la pénibilité, un trimestre supplémentaire de retraite sera accordé.",
    normalizedText:
      "Nous voulons réformer le dispositif actuel de prise en compte de la pénibilité dans le calcul des droits à la retraite, en sortant de la logique individuelle du C3P et en lui substituant l’octroi automatique de trimestres supplémentaires : pour quatre trimestres cotisés dans un métier exposé à la pénibilité, un trimestre supplémentaire de retraite sera accordé.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 20,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-26",
    sourceText:
      "Nous voulons que les salariés sous-traitants puissent bénéficier des mêmes droits que les salariés de l'entreprise donneuse d'ordre (portabilité des droits).",
    normalizedText:
      "Nous voulons que les salariés sous-traitants puissent bénéficier des mêmes droits que les salariés de l'entreprise donneuse d'ordre (portabilité des droits).",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 21,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-27",
    sourceText:
      "contrôler et menacer de pénalités les entreprises (surtout dans l’industrie) qui renouvellent incessamment les contrats d’intérim de 3x6 mois.",
    normalizedText:
      "contrôler et menacer de pénalités les entreprises (surtout dans l’industrie) qui renouvellent incessamment les contrats d’intérim de 3x6 mois.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 21,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-28",
    sourceText:
      "La suppression de la condition des « 10 salariés et plus » pour permettre aux travailleuses et travailleurs essentiels d’avoir accès aux services du 1 % patronal.",
    normalizedText:
      "La suppression de la condition des « 10 salariés et plus » pour permettre aux travailleuses et travailleurs essentiels d’avoir accès aux services du 1 % patronal.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 22,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-29",
    sourceText:
      "Une priorisation des travailleuses et travailleurs essentiels dans l’accès aux dispositifs et aux aides financées par le 1 % patronal.",
    normalizedText:
      "Une priorisation des travailleuses et travailleurs essentiels dans l’accès aux dispositifs et aux aides financées par le 1 % patronal.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 22,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-30",
    sourceText: "le SMIC à 1 600€",
    normalizedText: "le SMIC à 1 600€",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 23,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-31",
    sourceText: "la retraite à 60 ans",
    normalizedText: "la retraite à 60 ans",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 23,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-32",
    sourceText: "POUR UN STATUT DES TRAVAILLEUSES & TRAVAILLEURS ESSENTIELS",
    normalizedText: "POUR UN STATUT DES TRAVAILLEUSES & TRAVAILLEURS ESSENTIELS",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 25,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-33",
    sourceText: "POUR UNE LOI DE SÉPARATION DE L’ARGENT & DE L’ÉTAT",
    normalizedText: "POUR UNE LOI DE SÉPARATION DE L’ARGENT & DE L’ÉTAT",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 1,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-34",
    sourceText: "pour renouer la confiance avec les citoyens",
    normalizedText: "Renouer la confiance avec les citoyens.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 3,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-35",
    sourceText: "pour que notre économie soit défendue",
    normalizedText: "pour que notre économie soit défendue",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 3,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-36",
    sourceText: "pour que l’État soit séparé de l’Argent, et non miné, colonisé de l’intérieur",
    normalizedText: "Séparer l'État de l'Argent.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 3,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-37",
    sourceText:
      "Le chef de l'État fixe lui-même les conditions de sa rémunération et celles des autres membres du gouvernement.",
    normalizedText:
      "Le chef de l'État fixe lui-même les conditions de sa rémunération et celles des autres membres du gouvernement.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 10,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "EXISTING_POLICY_DESCRIPTION",
    riskCategory: "EXISTING_POLICY",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-38",
    sourceText:
      "Au terme de leur mandat, les anciens présidents conservent une série d’avantages financés par les deniers publics : dotation mensuelle d’environ 6 000 €, cabinet composé de sept collaborateurs pendant cinq ans, puis de trois à vie, bureaux, véhicule avec chauffeur et protection policière à vie.",
    normalizedText:
      "Au terme de leur mandat, les anciens présidents conservent une série d’avantages financés par les deniers publics : dotation mensuelle d’environ 6 000 €, cabinet composé de sept collaborateurs pendant cinq ans, puis de trois à vie, bureaux, véhicule avec chauffeur et protection policière à vie.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 10,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "EXISTING_POLICY_DESCRIPTION",
    riskCategory: "EXISTING_POLICY",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-39",
    sourceText:
      "la « réforme » Lecornu n’a fait qu’entamer en trompe-l’œil les privilèges accordés aux anciens premiers ministres",
    normalizedText:
      "la « réforme » Lecornu n’a fait qu’entamer en trompe-l’œil les privilèges accordés aux anciens premiers ministres",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 10,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "HISTORICAL_ACTION",
    riskCategory: "HISTORICAL",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-40",
    sourceText:
      "Sur le modèle du principe « pollueur-payeur », nous défendons le principe du « broyeur-payeur »",
    normalizedText:
      "Sur le modèle du principe « pollueur-payeur », nous défendons le principe du « broyeur-payeur »",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 15,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-41",
    sourceText: "il devra bien gagner sa croûte seul lorsque nous aurons mis fin aux privilèges",
    normalizedText:
      "il devra bien gagner sa croûte seul lorsque nous aurons mis fin aux privilèges",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 17,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "RHETORICAL_FORMULATION",
    riskCategory: "RHETORICAL",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-42",
    sourceText: "Quand un amendement vient d’un lobby, les citoyens doivent le savoir.",
    normalizedText: "Quand un amendement vient d’un lobby, les citoyens doivent le savoir.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 19,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-43",
    sourceText: "Quand un ministre reçoit une grande entreprise, les citoyens doivent le savoir.",
    normalizedText:
      "Quand un ministre reçoit une grande entreprise, les citoyens doivent le savoir.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 19,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-44",
    sourceText:
      "Quand un texte de loi est modifié après une réunion privée, les citoyens doivent le savoir.",
    normalizedText:
      "Quand un texte de loi est modifié après une réunion privée, les citoyens doivent le savoir.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 19,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-45",
    sourceText: "Pour savoir qui influence la loi, il faut une traçabilité beaucoup plus complète.",
    normalizedText:
      "Pour savoir qui influence la loi, il faut une traçabilité beaucoup plus complète.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 20,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-46",
    sourceText:
      "Nous voulons une République où une décision publique est transparente : qui a été reçu, sur quoi, avec quelle demande, avec quelle contribution, et au terme de quel arbitrage.",
    normalizedText:
      "Nous voulons une République où une décision publique est transparente : qui a été reçu, sur quoi, avec quelle demande, avec quelle contribution, et au terme de quel arbitrage.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 30,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-47",
    sourceText:
      "Non pour empêcher le débat, mais pour que les citoyens puissent le voir, le comprendre, le contester.",
    normalizedText:
      "Non pour empêcher le débat, mais pour que les citoyens puissent le voir, le comprendre, le contester.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 30,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "GENERAL_INTENT",
    riskCategory: "GENERAL_INTENT",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-48",
    sourceText: "Former, recruter, transmettre les savoir-faire.",
    normalizedText: "Former, recruter, transmettre les savoir-faire.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 31,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "RHETORICAL_FORMULATION",
    riskCategory: "RHETORICAL",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-49",
    sourceText: "Redonner aux administrations la capacité de penser, d’agir et de décider.",
    normalizedText: "Redonner aux administrations la capacité de penser, d’agir et de décider.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 31,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-50",
    sourceText:
      "Ceux qui profitent de l‘opacité, du côté de la puissance publique comme de celui des entreprises, ceux qui contournent les règles doivent être sanctionnés.",
    normalizedText:
      "Ceux qui profitent de l‘opacité, du côté de la puissance publique comme de celui des entreprises, ceux qui contournent les règles doivent être sanctionnés.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 32,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "GENERAL_INTENT",
    riskCategory: "GENERAL_INTENT",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-51",
    sourceText:
      "Ceux qui utilisent l‘État comme marchepied vers des intérêts privés doivent être empêchés de recommencer.",
    normalizedText:
      "Empêcher ceux qui utilisent l'État comme marchepied vers des intérêts privés de recommencer.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 32,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "GENERAL_INTENT",
    riskCategory: "GENERAL_INTENT",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-52",
    sourceText:
      "Il faut appliquer la même logique à la vie démocratique. Celui qui abîme l‘État, celui qui capture la décision publique, celui qui prospère grâce à la connivence doit en payer le prix.",
    normalizedText:
      "Il faut appliquer la même logique à la vie démocratique. Celui qui abîme l‘État, celui qui capture la décision publique, celui qui prospère grâce à la connivence doit en payer le prix.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 32,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-53",
    sourceText:
      "Pas des rappels à l‘ordre. Pas des chartes sans effet. Pas des avis que personne ne vérifie. Mais des contrôles réels. Des interdictions effectives. Des sanctions qui dissuadent vraiment.",
    normalizedText:
      "Pas des rappels à l‘ordre. Pas des chartes sans effet. Pas des avis que personne ne vérifie. Mais des contrôles réels. Des interdictions effectives. Des sanctions qui dissuadent vraiment.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 32,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "RHETORICAL_FORMULATION",
    riskCategory: "RHETORICAL",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-54",
    sourceText: "nos PROPOSITIONS POUR UNE LOI DE SÉPARATION DE L’ARGENT ET DE L’ÉTAT",
    normalizedText: "nos PROPOSITIONS POUR UNE LOI DE SÉPARATION DE L’ARGENT ET DE L’ÉTAT",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 34,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-55",
    sourceText:
      "Nous agirons pour faire en sorte que tous les représentants de la nation soient irréprochables : le Président de la République, le Premier ministre, les ministres, les élus de tous bords.",
    normalizedText:
      "Nous agirons pour faire en sorte que tous les représentants de la nation soient irréprochables : le Président de la République, le Premier ministre, les ministres, les élus de tous bords.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 35,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-56",
    sourceText:
      "Nous en profiterons pour supprimer tous les avantages indus que se sont octroyés les gouvernements successifs.",
    normalizedText: "Supprimer tous les avantages indus octroyés par les gouvernements successifs.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 35,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-57",
    sourceText:
      "Nous mettrons fin aux intérêts personnels liés aux fonctions présidentielles et de ministre.",
    normalizedText:
      "Nous mettrons fin aux intérêts personnels liés aux fonctions présidentielles et de ministre.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 36,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-58",
    sourceText:
      "Nos successeurs n’auront plus la liberté de fixer eux-mêmes leur salaire : nous rendrons obligatoire la cohérence du salaire du Président de la République avec l’échelle des salaires.",
    normalizedText:
      "Rendre obligatoire la cohérence du salaire du Président de la République avec l'échelle des salaires.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 36,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-59",
    sourceText: "Il en sera de même pour les salaires des ministres.",
    normalizedText: "Il en sera de même pour les salaires des ministres.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 36,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "INSUFFICIENT_ATTRIBUTION",
    riskCategory: "ATTRIBUTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-60",
    sourceText:
      "Nous ferons 20 millions d’euros d’économies sur le budget de l’Élysée : finies les commandes exorbitantes de vaisselle en céramique !",
    normalizedText:
      "Nous ferons 20 millions d’euros d’économies sur le budget de l’Élysée : finies les commandes exorbitantes de vaisselle en céramique !",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 36,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-63",
    sourceText:
      "Il ne sera plus possible, comme l’avait fait Valérie Pécresse lorsqu’elle était à la tête de la région Ile-de-France, de rendre moins visibles ses intérêts par le biais d’une fiducie.",
    normalizedText:
      "Il ne sera plus possible, comme l’avait fait Valérie Pécresse lorsqu’elle était à la tête de la région Ile-de-France, de rendre moins visibles ses intérêts par le biais d’une fiducie.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-64",
    sourceText:
      "nous prendrons exemple sur certains de nos amis scandinaves qui forcent notamment leurs responsables politiques à faire gérer leurs actifs financiers par un tiers indépendant, sans information au propriétaire.",
    normalizedText:
      "nous prendrons exemple sur certains de nos amis scandinaves qui forcent notamment leurs responsables politiques à faire gérer leurs actifs financiers par un tiers indépendant, sans information au propriétaire.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-65",
    sourceText: "un ministre mis en examen quittera immédiatement le Gouvernement",
    normalizedText: "un ministre mis en examen quittera immédiatement le Gouvernement",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-66",
    sourceText:
      "Nous mettrons fin à l’inviolabilité pénale et civile complète du Président de la République et au privilège de juridiction des ministres.",
    normalizedText:
      "Nous mettrons fin à l’inviolabilité pénale et civile complète du Président de la République et au privilège de juridiction des ministres.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-67",
    sourceText:
      "Les crimes et les délits ne pourront plus rester impunis pendant la durée de leur mandat.",
    normalizedText:
      "Les crimes et les délits ne pourront plus rester impunis pendant la durée de leur mandat.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-68",
    sourceText:
      "Nous supprimerons pour ce faire la Cour de justice de la République dont la légitimité ne cesse d’être remise en cause.",
    normalizedText:
      "Nous supprimerons pour ce faire la Cour de justice de la République dont la légitimité ne cesse d’être remise en cause.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-69",
    sourceText:
      "Nous la remplacerons par une procédure permettant à la fois d’éviter les plaintes et procédures abusives inhérentes à la fonction même de ministre tout en garantissant un procès équitable.",
    normalizedText:
      "Nous la remplacerons par une procédure permettant à la fois d’éviter les plaintes et procédures abusives inhérentes à la fonction même de ministre tout en garantissant un procès équitable.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 37,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-70",
    sourceText:
      "Les candidats à un mandat électif seront obligés de présenter un bulletin n°2 du casier judiciaire vierge de toute condamnation pour atteintes les plus graves à l’ordre social (infractions criminelles et délits d’ordre sexuel) ainsi que pour manquement au devoir de probité — fraude fiscale et électorale incluses.",
    normalizedText:
      "Les candidats à un mandat électif seront obligés de présenter un bulletin n°2 du casier judiciaire vierge de toute condamnation pour atteintes les plus graves à l’ordre social (infractions criminelles et délits d’ordre sexuel) ainsi que pour manquement au devoir de probité — fraude fiscale et électorale incluses.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 39,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-71",
    sourceText:
      "Ils devront éviter les conflits d’intérêts financiers directs par une plus grande transparence de la propriété effective.",
    normalizedText:
      "Ils devront éviter les conflits d’intérêts financiers directs par une plus grande transparence de la propriété effective.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 39,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-72",
    sourceText:
      "En clair, nous introduirons une nouvelle condition d’éligibilité à l’instar des dispositions déjà prévues par le code électoral qui ordonne que « nul ne peut être élu s’il ne justifie avoir satisfait aux obligations imposées par le code du service national ».",
    normalizedText:
      "En clair, nous introduirons une nouvelle condition d’éligibilité à l’instar des dispositions déjà prévues par le code électoral qui ordonne que « nul ne peut être élu s’il ne justifie avoir satisfait aux obligations imposées par le code du service national ».",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 39,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-73",
    sourceText: "METTRE FIN AU CUMUL DES MANDATS EXÉCUTIFS LOCAUX ET DES FONCTIONS MINISTÉRIELLES.",
    normalizedText:
      "METTRE FIN AU CUMUL DES MANDATS EXÉCUTIFS LOCAUX ET DES FONCTIONS MINISTÉRIELLES.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 40,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-74",
    sourceText:
      "Il sera mis fin à la possibilité de cumuler les fonctions ministérielles avec des responsabilités exécutives locales, comme c’est aujourd’hui le cas pour les parlementaires.",
    normalizedText:
      "Il sera mis fin à la possibilité de cumuler les fonctions ministérielles avec des responsabilités exécutives locales, comme c’est aujourd’hui le cas pour les parlementaires.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 40,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-75",
    sourceText:
      "C’est pourquoi chaque ministre devra effectuer, au début de son mandat puis régulièrement, des stages d’immersion dans les métiers du quotidien relevant de son ministère : des journées au contact du travail réel, sans opération de communication, auprès de celles et ceux qui font tenir le pays.",
    normalizedText:
      "C’est pourquoi chaque ministre devra effectuer, au début de son mandat puis régulièrement, des stages d’immersion dans les métiers du quotidien relevant de son ministère : des journées au contact du travail réel, sans opération de communication, auprès de celles et ceux qui font tenir le pays.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 40,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-76",
    sourceText:
      "CRÉER LA HAUTE AUTORITÉ À LA PROBITÉ, FUSION DE L’ENSEMBLE DES ORGANES EXISTANTS DE L’ÉTHIQUE DE LA VIE PUBLIQUE.",
    normalizedText:
      "Créer la Haute Autorité à la Probité, fusionnant l'ensemble des organes existants de l'éthique de la vie publique.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 41,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-83",
    sourceText:
      "INSTAURER UNE PÉRIODE DE « REFROIDISSEMENT RENFORCÉ » POUR LES MINISTRES SORTANTS ET LEURS ÉQUIPES.",
    normalizedText:
      "Instaurer une période de refroidissement renforcé pour les ministres sortants et leurs équipes.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 43,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-87",
    sourceText: "ENCADRER STRICTEMENT LE PANTOUFLAGE ET INTERDIRE LE RÉTRO-PANTOUFLAGE.",
    normalizedText: "Encadrer strictement le pantouflage et interdire le rétro-pantouflage.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 44,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-94",
    sourceText: "METTRE MCKINSEY AU CHÔMAGE.",
    normalizedText: "METTRE MCKINSEY AU CHÔMAGE.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 46,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-95",
    sourceText: "Nous poserons un principe clair : priorité au savoir-faire public.",
    normalizedText: "Nous poserons un principe clair : priorité au savoir-faire public.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 46,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "REJECT",
    editorialReason: "SLOGAN",
    riskCategory: "SLOGAN",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-96",
    sourceText:
      "L’État et ses opérateurs ne pourront faire appel à un cabinet privé que s’ils démontrent qu’aucune compétence interne disponible ne permet de réaliser la mission.",
    normalizedText:
      "L’État et ses opérateurs ne pourront faire appel à un cabinet privé que s’ils démontrent qu’aucune compétence interne disponible ne permet de réaliser la mission.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 46,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-97",
    sourceText:
      "En l’absence de telles compétences, la recherche publique constituera le premier recours : universités, organismes de recherche et laboratoires seront systématiquement sollicités afin que l’expertise scientifique irrigue davantage les politiques publiques.",
    normalizedText:
      "En l’absence de telles compétences, la recherche publique constituera le premier recours : universités, organismes de recherche et laboratoires seront systématiquement sollicités afin que l’expertise scientifique irrigue davantage les politiques publiques.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 46,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-98",
    sourceText:
      "Ce n’est qu’en dernier ressort que l’État pourra se tourner vers des acteurs privés.",
    normalizedText:
      "Ce n’est qu’en dernier ressort que l’État pourra se tourner vers des acteurs privés.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 46,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-99",
    sourceText: "Chaque recours aux cabinets devra être justifié, motivé et rendu public.",
    normalizedText: "Chaque recours aux cabinets devra être justifié, motivé et rendu public.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 46,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-100",
    sourceText: "Nous lancerons un plan de réinternalisation des compétences publiques.",
    normalizedText: "Lancer un plan de réinternalisation des compétences publiques.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 47,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-105",
    sourceText: "nous rendrons obligatoire une empreinte de décision sur chaque texte important",
    normalizedText: "Rendre obligatoire une empreinte de décision sur chaque texte important",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 48,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-112",
    sourceText: "Nous voulons passer d‘une transparence partielle à une transparence réelle",
    normalizedText: "Passer d'une transparence partielle à une transparence réelle",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 48,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-129",
    sourceText: "SUPPRIMER L’ACTUELLE CONVENTION JUDICIAIRE D’INTÉRÊT PUBLIC (CJIP).",
    normalizedText: "Supprimer l'actuelle convention judiciaire d'intérêt public (CJIP).",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 52,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-134",
    sourceText: "RENDRE COLLÉGIALES LES NOMINATIONS AUX POSTES À RESPONSABILITÉ.",
    normalizedText: "Rendre collégiales les nominations aux postes à responsabilité.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 53,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-142",
    sourceText: "La lumière doit être faite sur les privatisations passées.",
    normalizedText: "La lumière doit être faite sur les privatisations passées.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 54,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-149",
    sourceText:
      "Cette loi de séparation de l’État et de l’argent est nécessaire pour renouer avec la confiance dans nos institutions.",
    normalizedText:
      "Cette loi de séparation de l’État et de l’argent est nécessaire pour renouer avec la confiance dans nos institutions.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 56,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-accepted-150",
    sourceText:
      "C’est aussi un préalable à la remise sur pied d’un État stratège, qui anticipe les mutations du monde et de la société, cultive l’excellence de ses compétences, au service de l’intérêt général.",
    normalizedText:
      "C’est aussi un préalable à la remise sur pied d’un État stratège, qui anticipe les mutations du monde et de la société, cultive l’excellence de ses compétences, au service de l’intérêt général.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 56,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-73",
    sourceText:
      "Nous sécuriserons aussi la responsabilité des dirigeants bénévoles, trop souvent exposés juridiquement pour un engagement désintéressé, notamment en plafonnant la responsabilité financière personnelle des dirigeants bénévoles à un montant proportionné à leurs ressources (hors cas de fraude avérée).",
    normalizedText:
      "Plafonner la responsabilité financière personnelle des dirigeants bénévoles à un montant proportionné à leurs ressources, hors cas de fraude avérée.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 25,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-92",
    sourceText:
      "En plus des emplois aidés, nous doublerons le nombre de postes FONJEP et nous porterons l’aide à 15 000 € par poste.",
    normalizedText: "Doubler le nombre de postes FONJEP et porter l'aide à 15 000 € par poste.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 29,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-97",
    sourceText:
      "Nous généraliserons les conventions pluriannuelles d’objectifs, sur 3 à 5 ans, avec un statut juridique renforcé, pour permettre aux associations de construire un projet dans la durée plutôt que de survivre appel à projets après appel à projets.",
    normalizedText:
      "Généraliser les conventions pluriannuelles d'objectifs sur 3 à 5 ans avec un statut juridique renforcé pour les associations.",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 29,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-153",
    sourceText:
      "Ateliers de pratiques manuelles et de réparation, en ouvrant un financement fléché vers les acteurs artistiques et culturels et de l’économie sociale et solidaire présents sur le terrain (repair cafés, ressourceries, ateliers partagés).",
    normalizedText:
      "Ouvrir un financement fléché vers les acteurs artistiques, culturels et de l’économie sociale et solidaire pour des ateliers de pratiques manuelles et de réparation (repair cafés, ressourceries, ateliers partagés).",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 40,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: true,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-74",
    sourceText:
      "Nous créerons un véritable congé bénévole, ouvert à toutes et tous, y compris sans mandat statutaire, et sans perte de revenus, ce qui permettra aux salariés des grandes entreprises de s’engager dans l’association de leur choix une demi-journée par mois sur le modèle du mécénat de compétences.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 25,
    heading: null,
    modelClassification: "AMBIGUOUS",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-94",
    sourceText:
      "Nous garantirons l’accès de toutes et tous au sport et aux loisirs, en prenant en charge la moitié du coût des li- cences au-delà du Pass’Sport pour les familles modestes, et en finançant l’embauche d’animateurs pour les accueils de loisirs, alors qu’il en a manqué 40 000 l’été dernier pour encadrer deux millions d’enfants.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 29,
    heading: null,
    modelClassification: "AMBIGUOUS",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-105",
    sourceText:
      "Nous instaurerons un droit automatique à un premier départ collectif. Sur le modèle de ce qu’a expérimenté la ville de Trappes, nous proposerons un droit garantissant que chaque enfant français bénéficie d’au moins un séjour collectif, en colos, financé pendant la scolarité obligatoire, sans démarche à effectuer par les familles.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 31,
    heading: null,
    modelClassification: "AMBIGUOUS",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-120",
    sourceText:
      "proposition de loi portant mesures d’urgence pour les vacances présentée par François Ruffin et ses collègues en juillet 2023",
    normalizedText: "présenter une proposition de loi portant mesures d’urgence pour les vacances",
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 33,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "MEASURE",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "HISTORICAL_ACTION",
    riskCategory: "HISTORICAL",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-132",
    sourceText:
      "Nous garantirons par la loi le maintien d’une offre non lucrative, en conditionnant les aides publiques au tourisme à des engagements de modération tarifaire et d’accessibilité, pour éviter que chaque crise économique ne se traduise par une privatisation et une augmentation des prix des lieux d’hébergement collectif.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 35,
    heading: null,
    modelClassification: "AMBIGUOUS",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "precalibration-loisirs-80",
    sourceText:
      "Le cadre juridique existe déjà (article L.212-15 du Code de l’éducation, qui permet au maire de mettre les locaux scolaires à disposition d’activités culturelles, sportives ou associatives hors temps scolaire) : il reste largement sous-utilisé faute de moyens pour financer le gardiennage et l’entretien que cela suppose.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf",
    page: 27,
    heading: null,
    modelClassification: "DIAGNOSIS",
    pipelineClassification: "DIAGNOSIS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "EXISTING_POLICY_DESCRIPTION",
    riskCategory: "EXISTING_POLICY",
    snapshot: "PRECALIBRATION_FULL_2026-08-15",
  },
  {
    id: "calibrated-rejected-0",
    sourceText:
      "construire leur cussion avec les salariés eux-mêmes, avec leurs syndicats, avec l'appui de la loi",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 2,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "OTHER",
    riskCategory: "PARSER_GROUNDING",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-13",
    sourceText:
      "Macron et ses ministres ont eu un mot pendant le Covid. Puis ils ont repris la même politique : défaire le droit du travail pour plaire au patronat, morceler le travail pour défaire les luttes sociales.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 3,
    heading: null,
    modelClassification: "DIAGNOSIS",
    pipelineClassification: "DIAGNOSIS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-41",
    sourceText: "On dépasse souvent, mais ces minutes-là ne sont pas payées.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 7,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-42",
    sourceText:
      "Et sur la route aussi ils nous roulent : ils mettent des coupures pour ne pas payer les déplacements.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 7,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-79",
    sourceText:
      "Pour en finir avec cette érosion du pouvoir d’achat, nous indexerons les salaires sur l’inflation, comme cela a existé jusqu’en 1982.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 15,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "PARSER_GROUNDING",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-82",
    sourceText:
      "Pour en finir avec les grilles salariales en dessous du SMIC et au-delà du minimum légal en vigueur, permettre plus de progression au cours de la carrière, nous revaloriserons les grilles de classification.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 15,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "PARSER_GROUNDING",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-88",
    sourceText:
      "Systématiser la rémunération forfaitaire des coupures de plus de 2 h imposées par l’employeur.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 17,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_LIST_ITEM",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-89",
    sourceText: "Instaurer le principe d’une durée de service minimale.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 17,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_LIST_ITEM",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-90",
    sourceText: "Ajouter du temps rémunéré à toute prise de poste.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 17,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_LIST_ITEM",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-91",
    sourceText:
      "Compter le temps de transport entre deux interventions comme du temps de travail effectif.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 17,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_LIST_ITEM",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-96",
    sourceText:
      "L’entreprise pourrait par exemple s’exposer à un rappel de salaire correspondant au nombre d’heures comprises entre la durée contractuelle de travail et le plancher hebdomadaire de 24 heures.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 18,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "OTHER",
    riskCategory: "RHETORICAL",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-116",
    sourceText:
      "La loi existe mais il faut la rendre effective, notamment en recrutant un nombre suffisant d’inspecteurs du travail.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 21,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "PARSER_GROUNDING",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-127",
    sourceText: "qui revalorisent le travail",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf",
    page: 23,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-240",
    sourceText:
      "La loi Sapin II a créé un registre des représentants d’intérêts. C’était un premier pas. Mais le cadre reste trop limité.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 19,
    heading: null,
    modelClassification: "DIAGNOSIS",
    pipelineClassification: "DIAGNOSIS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "EXISTING_POLICY_DESCRIPTION",
    riskCategory: "EXISTING_POLICY",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-250",
    sourceText:
      "Le rapport du Sénat sur les cabinets de conseil est accablant : en 2021, les dépenses de conseil de l’État ont dépassé le milliard d’euros, dont 893,9 millions d’euros pour les ministères. Ces dépenses ont plus que doublé depuis 2018, notamment durant la crise Covid.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 21,
    heading: null,
    modelClassification: "DIAGNOSIS",
    pipelineClassification: "DIAGNOSIS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "THIRD_PARTY_PROPOSAL",
    riskCategory: "THIRD_PARTY",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-304",
    sourceText:
      "La mise en application de ces règles auraient eu des effets très concrets : Caroline Cayeux n’aurait pas pu entrer au Gouvernement sans justifier pleinement sa situation fiscale et patrimoniale.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 38,
    heading: null,
    modelClassification: "MEASURE",
    pipelineClassification: "AMBIGUOUS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "HISTORICAL_ACTION",
    riskCategory: "HISTORICAL",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-327",
    sourceText:
      "Les citoyens doivent savoir qui conseille l’État, pour combien, et avec quelle influence.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 47,
    heading: null,
    modelClassification: "OBJECTIVE",
    pipelineClassification: "OBJECTIVE",
    pipelineAccepted: false,
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-348",
    sourceText:
      "Le parquet avait, en amont, proposé à l’association de défense des consommateurs Foodwatch de chiffrer le préjudice subi. Une proposition fermement rejetée par l’association, d’une part car les faits reprochés à Nestlé Waters — notamment la tromperie — n’entraient pas du tout dans le champ d’application de la CJIPE, et, d’autre part, pour qu’une information judiciaire soit ouverte en vue d’un procès. En vain.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 52,
    heading: null,
    modelClassification: "DIAGNOSIS",
    pipelineClassification: "DIAGNOSIS",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "THIRD_PARTY_PROPOSAL",
    riskCategory: "THIRD_PARTY",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
  {
    id: "calibrated-rejected-363",
    sourceText:
      "Séparer l’État et l’argent n’est pas uniquement une question de morale, d’éthique de la politique. C’est un point essentiel pour construire le modèle de société que nous voulons.",
    normalizedText: null,
    documentUrl:
      "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf",
    page: 56,
    heading: null,
    modelClassification: "VALUE",
    pipelineClassification: "VALUE",
    pipelineAccepted: false,
    humanDecision: "REJECT",
    editorialReason: "VALUE",
    riskCategory: "VALUE",
    snapshot: "CALIBRATED_PARTIAL_2026-08-15",
  },
];
