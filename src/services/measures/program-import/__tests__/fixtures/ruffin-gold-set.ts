import type { PresidentialThemeCategory } from "@/lib/presidentielle/themes";
import type { ExtractedProposal } from "../../types";

export type RuffinGoldSetEntry = {
  id: string;
  sourceText: string;
  expectedClassification: ExtractedProposal["classification"];
  expectedTheme: PresidentialThemeCategory | null;
  documentUrl: string;
  page: number;
  notes: string;
  expectedNormalizedText?: string;
  historical?: boolean;
};

const TRAVAIL_URL =
  "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf";
const PROBITE_URL =
  "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf";
const LOISIRS_URL =
  "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf";

// Calibration humaine issue des trois cahiers officiels. Les attentes décrivent le texte
// source, pas une précédente sortie du modèle. Les numéros de page sont ceux des PDF.
export const RUFFIN_GOLD_SET: RuffinGoldSetEntry[] = [
  {
    id: "travail-measure-indexation",
    sourceText:
      "Pour en finir avec cette érosion du pouvoir d’achat, nous indexerons les salaires sur l’inflation, comme cela a existé jusqu’en 1982.",
    expectedClassification: "MEASURE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 15,
    notes: "Action explicite, mécanisme et cible identifiés.",
    expectedNormalizedText: "Indexer les salaires sur l’inflation, comme jusqu’en 1982.",
  },
  {
    id: "travail-measure-grilles",
    sourceText:
      "Pour en finir avec les grilles salariales en dessous du SMIC et permettre plus de progression au cours de la carrière, nous revaloriserons les grilles de classification.",
    expectedClassification: "MEASURE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 15,
    notes: "Action et objet réglementaire explicites.",
    expectedNormalizedText: "Revaloriser les grilles de classification.",
  },
  {
    id: "travail-measure-horaires",
    sourceText:
      "Lutter contre les horaires atypiques en rémunérant double les heures avant 8 h et après 18 h.",
    expectedClassification: "MEASURE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 16,
    notes: "Seuils horaires et niveau de rémunération présents.",
    expectedNormalizedText: "Rémunérer double les heures effectuées avant 8 h et après 18 h.",
  },
  {
    id: "travail-measure-retraite-penibilite",
    sourceText:
      "Pour quatre trimestres cotisés dans un métier exposé à la pénibilité, un trimestre supplémentaire de retraite sera accordé.",
    expectedClassification: "MEASURE",
    expectedTheme: "RETRAITES",
    documentUrl: TRAVAIL_URL,
    page: 20,
    notes: "Barème chiffré et bénéficiaires explicites.",
    expectedNormalizedText:
      "Accorder un trimestre supplémentaire de retraite pour quatre trimestres cotisés dans un métier exposé à la pénibilité.",
  },
  {
    id: "travail-measure-portabilite",
    sourceText:
      "Nous voulons que les salariés sous-traitants puissent bénéficier des mêmes droits que les salariés de l’entreprise donneuse d’ordre.",
    expectedClassification: "MEASURE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 21,
    notes: "Droit nouveau, population et référence de comparaison explicites.",
    expectedNormalizedText:
      "Garantir aux salariés sous-traitants les mêmes droits que ceux de l’entreprise donneuse d’ordre.",
  },
  {
    id: "travail-measure-interim",
    sourceText:
      "Il s’agit de contrôler et menacer de pénalités les entreprises qui renouvellent incessamment les contrats d’intérim de 3x6 mois.",
    expectedClassification: "MEASURE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 21,
    notes: "Contrôle, sanction et pratique ciblée sont présents.",
    expectedNormalizedText:
      "Contrôler et menacer de pénalités les entreprises qui renouvellent des contrats d’intérim de 3x6 mois.",
  },
  {
    id: "probite-measure-haute-autorite",
    sourceText:
      "Créer la Haute Autorité à la probité, fusion de l’ensemble des organes existants de l’éthique de la vie publique.",
    expectedClassification: "MEASURE",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 41,
    notes: "Création institutionnelle et modalité de fusion explicites.",
    expectedNormalizedText:
      "Créer la Haute Autorité à la probité en fusionnant les organes existants de l’éthique de la vie publique.",
  },
  {
    id: "probite-measure-refroidissement",
    sourceText:
      "Instaurer une période de « refroidissement renforcé » pour les ministres sortants et leurs équipes.",
    expectedClassification: "MEASURE",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 43,
    notes: "Dispositif et population visée explicites.",
    expectedNormalizedText:
      "Instaurer une période de refroidissement renforcé pour les ministres sortants et leurs équipes.",
  },
  {
    id: "probite-measure-empreinte-decision",
    sourceText:
      "Conformément aux recommandations de l’OCDE, nous rendrons obligatoire une empreinte de décision sur chaque texte important.",
    expectedClassification: "MEASURE",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 48,
    notes: "Obligation et dispositif nommés, sans compléter leur portée.",
    expectedNormalizedText:
      "Rendre obligatoire une empreinte de décision sur chaque texte important, conformément aux recommandations de l’OCDE.",
  },
  {
    id: "probite-measure-cjip",
    sourceText: "Supprimer l’actuelle convention judiciaire d’intérêt public (CJIP).",
    expectedClassification: "MEASURE",
    expectedTheme: "SECURITE_JUSTICE",
    documentUrl: PROBITE_URL,
    page: 52,
    notes: "Suppression explicite d’un dispositif précisément nommé.",
    expectedNormalizedText: "Supprimer la convention judiciaire d’intérêt public (CJIP).",
  },
  {
    id: "loisirs-measure-conge-benevole",
    sourceText:
      "Nous créerons un véritable congé bénévole, ouvert à toutes et tous, y compris sans mandat statutaire, et sans perte de revenus.",
    expectedClassification: "MEASURE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: LOISIRS_URL,
    page: 25,
    notes: "Création, bénéficiaires et condition de rémunération explicites.",
    expectedNormalizedText:
      "Créer un congé bénévole ouvert à toutes et tous, sans mandat statutaire ni perte de revenus.",
  },
  {
    id: "loisirs-measure-licences",
    sourceText:
      "Nous garantirons l’accès de toutes et tous au sport et aux loisirs, en prenant en charge la moitié du coût des licences au-delà du Pass’Sport pour les familles modestes.",
    expectedClassification: "MEASURE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 29,
    notes: "Prise en charge, niveau, dispositif et bénéficiaires explicites.",
    expectedNormalizedText:
      "Prendre en charge la moitié du coût des licences au-delà du Pass’Sport pour les familles modestes.",
  },
  {
    id: "loisirs-measure-premier-depart",
    sourceText: "Nous instaurerons un droit automatique à un premier départ collectif.",
    expectedClassification: "MEASURE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 31,
    notes: "Création explicite d’un droit identifiable.",
    expectedNormalizedText: "Instaurer un droit automatique à un premier départ collectif.",
  },
  {
    id: "loisirs-measure-tourisme",
    sourceText:
      "Nous garantirons par la loi le maintien d’une offre non lucrative, en conditionnant les aides publiques au tourisme à des engagements de modération tarifaire et d’accessibilité.",
    expectedClassification: "MEASURE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 35,
    notes: "Instrument légal, condition et aides ciblées sont explicites.",
    expectedNormalizedText:
      "Conditionner les aides publiques au tourisme à des engagements de modération tarifaire et d’accessibilité.",
  },
  {
    id: "travail-objective-remuneration",
    sourceText:
      "Mieux payer celles et ceux qui prennent soin, qui accompagnent, qui nettoient, qui nourrissent.",
    expectedClassification: "OBJECTIVE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 14,
    notes: "Résultat recherché vérifiable, sans niveau de rémunération ni instrument.",
  },
  {
    id: "travail-objective-reconversion",
    sourceText: "Garantir un droit à la reconversion professionnelle.",
    expectedClassification: "OBJECTIVE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 20,
    notes: "Droit visé, modalités absentes de cet extrait isolé.",
  },
  {
    id: "probite-objective-confiance",
    sourceText:
      "Cette loi de séparation de l’État et de l’argent est nécessaire pour renouer avec la confiance dans nos institutions.",
    expectedClassification: "OBJECTIVE",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 56,
    notes: "Finalité de la loi, pas une mesure autonome.",
  },
  {
    id: "loisirs-objective-priorite",
    sourceText:
      "Nous voulons inverser cette priorité en privilégiant les vacances pour tous plutôt que le tourisme de masse.",
    expectedClassification: "OBJECTIVE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 34,
    notes: "Orientation vérifiable, instrument absent de cet extrait.",
  },
  {
    id: "loisirs-objective-temps",
    sourceText:
      "Reconquérir du temps libéré et garantir un droit effectif aux loisirs pour toutes et tous.",
    expectedClassification: "OBJECTIVE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 44,
    notes: "Finalité générale du cahier, sans dispositif dans l’extrait.",
  },
  {
    id: "travail-diagnosis-securite-sociale",
    sourceText: "La Sécurité sociale est aujourd’hui le premier payeur des effets du mal-travail.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 13,
    notes: "Constat causal, aucune action annoncée.",
  },
  {
    id: "travail-diagnosis-bas-salaires",
    sourceText: "1,4 millions de salariés à bas salaires dont 600 000 salariés de 40 ans ou plus.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 15,
    notes: "Donnée descriptive sur la population concernée.",
  },
  {
    id: "probite-diagnosis-sapin",
    sourceText:
      "La loi Sapin II a constitué un premier pas, mais elle laisse encore trop de possibilités de contournement.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 48,
    notes: "Évaluation d’un dispositif existant, sans action dans cette phrase.",
  },
  {
    id: "probite-diagnosis-cjip",
    sourceText:
      "La CJIP permet à une entreprise de s’arranger avec la justice en payant une amende en échange de l’abandon des poursuites qui pèsent sur elle.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "SECURITE_JUSTICE",
    documentUrl: PROBITE_URL,
    page: 52,
    notes: "Description critique du fonctionnement actuel.",
  },
  {
    id: "loisirs-diagnosis-vacances",
    sourceText: "Les vacances restent, en France, un marqueur d’inégalité sociale majeur.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 31,
    notes: "Constat social sans engagement autonome.",
  },
  {
    id: "loisirs-diagnosis-appels-projets",
    sourceText:
      "La multiplication des appels à projets a mis les associations en concurrence entre elles.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "INSTITUTIONS",
    documentUrl: LOISIRS_URL,
    page: 29,
    notes: "Diagnostic sur le financement associatif.",
  },
  {
    id: "loisirs-diagnosis-contrats-aides-2017",
    sourceText:
      "Macron a supprimé les contrats aidés en 2017, alors que les associations en étaient les principaux employeurs.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: LOISIRS_URL,
    page: 19,
    notes: "Décision historique attribuée à un autre mandat, pas un engagement 2027.",
    historical: true,
  },
  {
    id: "loisirs-diagnosis-proposition-2023",
    sourceText:
      "Proposition de loi portant mesures d’urgence pour les vacances présentée par François Ruffin et ses collègues en juillet 2023.",
    expectedClassification: "DIAGNOSIS",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 33,
    notes: "Référence documentaire historique, aucune nouvelle action annoncée.",
    historical: true,
  },
  {
    id: "travail-value-representation",
    sourceText: "Notre tâche, c’est de défendre ceux qui en bavent contre ceux qui se gavent.",
    expectedClassification: "VALUE",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 11,
    notes: "Positionnement moral, sans politique publique définie.",
  },
  {
    id: "probite-value-interet-general",
    sourceText:
      "Séparer l’État et l’argent n’est pas uniquement une question de morale, d’éthique de la politique.",
    expectedClassification: "VALUE",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 56,
    notes: "Principe politique, sans action autonome.",
  },
  {
    id: "loisirs-value-vie-large",
    sourceText:
      "Comme Jaurès, nous voulons une « vie large », où priment les espaces et les temps qui échappent au marché, au règne de la marchandise, à la pure consommation.",
    expectedClassification: "VALUE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 13,
    notes: "Vision de société, pas un engagement opérationnel.",
  },
  {
    id: "loisirs-value-joie",
    sourceText:
      "Ces moments ne sont pas secondaires. Ils sont ce qui donne envie de se lever le matin, et ce qui fait tenir une société.",
    expectedClassification: "VALUE",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 15,
    notes: "Justification normative de la politique des loisirs.",
  },
  {
    id: "travail-intent-proteger",
    sourceText:
      "Nous voulons protéger en priorité celles et ceux qui n’ont pas de statut au sein du secteur privé.",
    expectedClassification: "GENERAL_INTENT",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 12,
    notes: "Population ciblée, action et mécanisme non définis.",
  },
  {
    id: "travail-intent-cout-social",
    sourceText:
      "Nous voulons aussi que les employeurs assument enfin le coût social de leurs choix économiques.",
    expectedClassification: "GENERAL_INTENT",
    expectedTheme: "EMPLOI_TRAVAIL",
    documentUrl: TRAVAIL_URL,
    page: 13,
    notes: "Orientation générale, mécanisme absent de cette phrase.",
  },
  {
    id: "probite-intent-transparence",
    sourceText: "Nous voulons une République où une décision publique est transparente.",
    expectedClassification: "GENERAL_INTENT",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 30,
    notes: "Intention claire mais sans exigence opérationnelle dans l’extrait.",
  },
  {
    id: "loisirs-intent-universel",
    sourceText: "Nous voulons des loisirs pour toutes et tous.",
    expectedClassification: "GENERAL_INTENT",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 14,
    notes: "Ambition générale sans mécanisme.",
  },
  {
    id: "loisirs-intent-joie",
    sourceText: "Nous voulons remettre de la joie dans le quotidien.",
    expectedClassification: "GENERAL_INTENT",
    expectedTheme: "EDUCATION_CULTURE",
    documentUrl: LOISIRS_URL,
    page: 15,
    notes: "Intention non mesurable et non instrumentée.",
  },
  {
    id: "probite-ambiguous-formation",
    sourceText: "Former, recruter, transmettre les savoir-faire.",
    expectedClassification: "AMBIGUOUS",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 31,
    notes: "Liste d’actions sans acteur, cible, volume ni dispositif.",
  },
  {
    id: "probite-ambiguous-mckinsey",
    sourceText: "Mettre McKinsey au chômage.",
    expectedClassification: "AMBIGUOUS",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 46,
    notes: "Formule politique dont le mécanisme exact n’est pas contenu dans l’extrait.",
  },
  {
    id: "probite-ambiguous-questions",
    sourceText:
      "Qui décide qu’un morceau du pays peut être vendu ? Selon quels critères ? Avec quelle transparence ?",
    expectedClassification: "AMBIGUOUS",
    expectedTheme: "INSTITUTIONS",
    documentUrl: PROBITE_URL,
    page: 23,
    notes: "Questions rhétoriques sans engagement formulé.",
  },
  {
    id: "loisirs-ambiguous-premiers-pas",
    sourceText:
      "Nos propositions sont autant de premiers pas pour retrouver du temps, des loisirs, de la joie partagée.",
    expectedClassification: "AMBIGUOUS",
    expectedTheme: null,
    documentUrl: LOISIRS_URL,
    page: 45,
    notes: "Phrase de conclusion qui ne permet pas d’isoler une proposition.",
  },
];
