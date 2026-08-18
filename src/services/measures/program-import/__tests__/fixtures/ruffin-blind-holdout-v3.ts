import type {
  BlindHoldoutEditorialReason,
  BlindHoldoutHumanDecision,
  BlindHoldoutRiskCategory,
} from "./ruffin-blind-holdout";

export type RuffinBlindHoldoutV3Entry = {
  id: string;
  documentUrl: string;
  page: number;
  segmentId: string;
  sourceText: string;
  humanDecision: BlindHoldoutHumanDecision;
  editorialReason: BlindHoldoutEditorialReason;
  riskCategory: BlindHoldoutRiskCategory;
};

export const RUFFIN_BLIND_HOLDOUT_V3_VERSION = "ruffin-blind-holdout-v3-pre-reveal-2026-08-16";

export const RUFFIN_BLIND_HOLDOUT_V3_FREEZE = {
  seed: "ruffin-blind-holdout-v3",
  extractor: "2ca9c3fcf6c2d709e6548a40a247cbce621cc66a0f6030044a2d894a130d945e",
  parser: "a2f1ac93ba232ac2ea07ca0d34dc759a2c3491a2917c24622e833b3e3b5f83e2",
  pipeline: "3664f3c37236509a2bec1a66e73bede2c72732b0190dc8f1d268af9f752c465b",
  policy: "18a2c40f2b5c552d64a48bd473f17209a5ce7d61e77d9be1b4c55956bc06e30d",
  types: "5a1799162359cdb8dd1cecba4bf9b7f2edb66d2f8c09ecf49afe916cca919a56",
  report: "4239c353c441879bb40308f5fd65cbfc00afb45a99f4e1846584b3a86a9d426b",
  selectedTechnicallyAccepted: 37,
  selectedRejectedAtRisk: 23,
  excludedPriorUniqueFingerprints: 225,
} as const;

const TRAVAIL =
  "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf";
const PROBITE =
  "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf";
const LOISIRS =
  "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf";

function entry(
  id: number,
  documentUrl: string,
  page: number,
  segmentId: string,
  sourceText: string,
  humanDecision: BlindHoldoutHumanDecision,
  editorialReason: BlindHoldoutEditorialReason,
  riskCategory: BlindHoldoutRiskCategory
): RuffinBlindHoldoutV3Entry {
  return {
    id: `blind-v3-${id}`,
    documentUrl,
    page,
    segmentId,
    sourceText,
    humanDecision,
    editorialReason,
    riskCategory,
  };
}

// Annotations réalisées à partir des seules citations. Les classes, gardes et décisions du
// pipeline n'ont pas été affichées avant le gel de cette fixture.
export const RUFFIN_BLIND_HOLDOUT_V3: RuffinBlindHoldoutV3Entry[] = [
  entry(
    1,
    TRAVAIL,
    21,
    "pdf-21-1",
    "nous voulons contrôler et menacer de pénalités les entreprises (surtout dans l’industrie) qui renouvellent incessamment les contrats d’intérim de 3x6 mois",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "QUANTIFIED_ACTION"
  ),
  entry(
    2,
    TRAVAIL,
    11,
    "pdf-11-1",
    "Notre tâche, c’est de les représenter politiquement, d’aider cette classe sociale à prendre conscience de sa propre force.",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    3,
    TRAVAIL,
    6,
    "pdf-6-1",
    "Dans un rapport de 2009 pour la New Economic Foundation, trois chercheuses britanniques [...] ont calculé que l’employée de crèche [...] rend à la société 9 fois ce qu’elle perçoit en salaire.",
    "REJECT",
    "DIAGNOSIS",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    4,
    TRAVAIL,
    5,
    "pdf-5-1",
    "D’abord en « simplifiant » le dialogue social, avec la loi Rebsamen (2015), pour affaiblir les contre-pouvoirs dans l’entreprise.",
    "REJECT",
    "HISTORICAL_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    5,
    TRAVAIL,
    2,
    "pdf-2-1",
    "que le chef d’entreprise ne soit pas laissé seul maître à bord, seul décideur de l’organisation, mais en discussion avec les salariés eux-mêmes, avec leurs syndicats",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    6,
    TRAVAIL,
    23,
    "pdf-23-1",
    "Des mesures fortes, concrètes, comme le SMIC à 1 600€ ou la retraite à 60 ans, qui revalorisent le travail",
    "REJECT",
    "TITLE_ONLY",
    "TITLE_OR_SLOGAN"
  ),
  entry(
    7,
    TRAVAIL,
    17,
    "pdf-17-1",
    "Nous voulons mieux protéger les salariés dont le temps de travail occupe une large amplitude horaire tout en étant très peu rémunéré.",
    "REJECT",
    "GENERAL_INTENT",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    8,
    TRAVAIL,
    17,
    "pdf-17-1",
    "Proposition 2 COMPTABILISER LES HEURES DE TRAVAIL INVISIBLES ET RÉDUIRE L’AMPLITUDE HORAIRE DES JOURNÉES. Nous voulons mieux protéger les salariés dont le temps de [...] Pour décourager les employeurs de recourir aux journées à trous, nous voulons actionner plusieurs leviers : ● S ystématiser la rémunération forfaitaire des coupures de plus de 2 h imposées par l’employeur.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "QUANTIFIED_ACTION"
  ),
  entry(
    9,
    TRAVAIL,
    18,
    "pdf-18-1",
    "sanctionner les entreprises qui y ont recours (actuellement, aucune sanction n’est fixée par le code du travail en cas d’infraction à la durée minimale de 24 heures)",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    10,
    TRAVAIL,
    19,
    "pdf-19-1",
    "il faudrait une prise en compte de l’amplitude horaire. Si je pars pendant huit heures, je suis payée huit heures.",
    "REJECT",
    "INSUFFICIENT_ATTRIBUTION",
    "THIRD_PARTY_OR_QUOTATION"
  ),
  entry(
    11,
    TRAVAIL,
    17,
    "pdf-17-1",
    "Proposition 2 COMPTABILISER LES HEURES DE TRAVAIL INVISIBLES ET RÉDUIRE L’AMPLITUDE HORAIRE DES JOURNÉES. Nous voulons mieux protéger les salariés dont le temps de [...] Pour décourager les employeurs de recourir aux journées à trous, nous voulons actionner plusieurs leviers : ● A jouter du temps rémunéré à toute prise de poste.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    12,
    TRAVAIL,
    18,
    "pdf-18-1",
    "nous voulons limiter les possibilités de dérogations conventionnelles à la durée minimale du travail",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    13,
    TRAVAIL,
    21,
    "pdf-21-1",
    "créer une obligation légale de faveur, visant à appliquer le régime le plus favorable entre le régime de l’entreprise sous-traitante ou le régime de l’entreprise donneuse d’ordre",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    14,
    TRAVAIL,
    5,
    "pdf-5-1",
    "on a durci l’assurance-chômage par décrets – Pénicaud en 2019, puis Élisabeth Borne en 2021.",
    "REJECT",
    "HISTORICAL_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    15,
    TRAVAIL,
    2,
    "pdf-2-1",
    "Que l’on cherche, au travail, le chemin de la fierté : se réaliser en réalisant.",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    16,
    TRAVAIL,
    15,
    "pdf-15-1",
    "Pour en finir avec cette érosion du pouvoir d’achat",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    17,
    TRAVAIL,
    17,
    "pdf-17-1",
    "Proposition 2 COMPTABILISER LES HEURES DE TRAVAIL INVISIBLES ET RÉDUIRE L’AMPLITUDE HORAIRE DES JOURNÉES. Nous voulons mieux protéger les salariés dont le temps de [...] Pour décourager les employeurs de recourir aux journées à trous, nous voulons actionner plusieurs leviers : ● C ompter le temps de transport entre deux interventions comme du temps de travail effectif.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    18,
    TRAVAIL,
    22,
    "pdf-22-1",
    "AUGMENTER LA PARTICIPATION DES EMPLOYEURS AU LOGEMENT DES TRAVAILLEUSES ET TRAVAILLEURS ESSENTIELS.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "TITLE_OR_SLOGAN"
  ),
  entry(
    19,
    TRAVAIL,
    6,
    "pdf-6-1",
    "UN CADRE PUBLICITAIRE GAGNE 4 FOIS PLUS QU’UNE AIDE-MÉNAGÈRE : INVERSONS LA HIÉRARCHIE DES SALAIRES !",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    20,
    TRAVAIL,
    12,
    "pdf-12-1",
    "Elisabeth Borne avait commandé, dès 2020, un rapport visant à reconnaître les travailleurs essentiels, et les conclusions sur les conditions de travail de ces salariés sont limpides. Mais qu’a-t-elle fait de ce rapport ? Renvoyer tout à la négociation et s’en laver les mains !",
    "REJECT",
    "HISTORICAL_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    21,
    LOISIRS,
    6,
    "pdf-6-1",
    "Mais un troisième étage doit encore être construit : que le peuple ne soit plus seulement spectateur ou pratiquant, mais acteur et décideur des pratiques culturelles qu’il désire.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    22,
    LOISIRS,
    27,
    "pdf-27-1",
    "Nous créerons des équipements polyvalents dans les zones qui en sont aujourd’hui dépourvues, en priorisant les territoires sans aucun lieu de réunion culturel, associatif ou festif.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    23,
    LOISIRS,
    32,
    "pdf-32-1",
    "Nous baisserons les tarifs des péages grâce à la reprise en main des autoroutes (fin des concessions, tarification publique).",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    24,
    LOISIRS,
    25,
    "pdf-25-1",
    "Nous donnerons au bénévolat un statut à la hauteur de son utilité sociale : une reconnaissance juridique spécifique, incluant une protection sociale partielle, un droit à la formation, et une prise en compte de l’engagement dans le déroulement de carrière et pour la retraite.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    25,
    LOISIRS,
    27,
    "pdf-27-1",
    "Nous rénoverons le parc existant, en finançant sur dossier la rénovation énergétique (isolation, chauffage), la mise aux normes de sécurité et d’accessibilité, et l’amélioration des usages (acoustique, scène mobile, modularité) des salles des fêtes, salles polyvalentes et locaux associatifs déjà en service.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    26,
    LOISIRS,
    32,
    "pdf-32-1",
    "Nous financerons l’itinérance des animateurs, par des véhicules et minibus dédiés, pour aller à la rencontre des jeunes sur leurs lieux de vie et les accompagner dans la construction de leurs propres projets de loisirs, plutôt que d’attendre qu’ils viennent à nous.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    27,
    LOISIRS,
    38,
    "pdf-38-1",
    "Nous voulons que cet espace public réponde à ce besoin, en réunissant en un seul lieu : des contenus d’auto-formation gratuits, un annuaire des associations et écoles d’enseignement artistique à proximité, les lieux disponibles pour pratiquer en autonomie, et des ressources pour se produire ou exposer son travail.",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    28,
    LOISIRS,
    14,
    "pdf-14-1",
    "Les loisirs participent de l’émancipation, de la santé, de la culture, de la confiance en soi et de l’égalité entre citoyens. C’est pourquoi nous en faisons un objectif politique à part entière : chacun doit pouvoir pratiquer, créer, apprendre, voyager, rencontrer les autres et s’engager, quels que soient ses revenus ou son adresse.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    29,
    LOISIRS,
    31,
    "pdf-31-1",
    "Nous proposons une loi-cadre pour garantir un droit réel aux vacances et aux loisirs collectifs, articulée autour de plusieurs mesures concrètes.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    30,
    LOISIRS,
    42,
    "pdf-42-1",
    "Nous mettrons fin au schisme entre l’enseignement artistique spécialisé et ce qui relèverait du pur loisir.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    31,
    LOISIRS,
    40,
    "pdf-40-1",
    "En donnant à chacun, quel que soit son quartier ou ses revenus, les moyens concrets de pratiquer, nous voulons remettre l’art et la création manuelle au cœur du quotidien, et non les réserver à celles et ceux qui peuvent se permettre d’acheter avant de savoir s’ils aimeront.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    32,
    LOISIRS,
    14,
    "pdf-14-1",
    "Nous voulons des loisirs pour toutes et tous. Pour les femmes comme pour les hommes. Pour les enfants, les adolescents, les adultes et les retraités. Pour les personnes valides comme pour celles en situation de handicap. Pour les quartiers populaires comme pour les centres-villes ou les villages. Pour les familles modestes comme pour les plus aisées.",
    "REJECT",
    "GENERAL_INTENT",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    33,
    LOISIRS,
    44,
    "pdf-44-1",
    "Ces domaines sont effectivement liés par l’objectif politique que nous entendons porter : reconquérir du temps libéré et garantir un droit effectif aux loisirs pour toutes et tous",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    34,
    LOISIRS,
    3,
    "pdf-3-1",
    "Qu’on se fixe donc cette ambition : 67 millions de vacanciers français !",
    "REJECT",
    "INSUFFICIENT_ATTRIBUTION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    35,
    LOISIRS,
    27,
    "pdf-27-1",
    "Nous financerons l’ouverture plus large des bâtiments publics existants, en priorité les écoles, sur les créneaux où ils sont inoccupés.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    36,
    LOISIRS,
    45,
    "pdf-45-1",
    "Redonner des moyens à nos associations, c’est renforcer la démocratie locale, là où les gens décident, font et se rencontrent.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "TITLE_OR_SLOGAN"
  ),
  entry(
    37,
    LOISIRS,
    35,
    "pdf-35-1",
    "Nous fédérerons une « route des métiers d’art» nationale, sur le modèle des initiatives régionales, en favorisant ainsi un tourisme social et culturel à l’échelle du territoire français.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    38,
    LOISIRS,
    38,
    "pdf-38-1",
    "Nous élargirons le Pass Culture au-delà des seuls mineurs, pour qu’il bénéficie également aux adultes les plus précaires ou isolés, pour qui l’accès aux loisirs et à la culture reste un premier renoncement budgétaire.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    39,
    LOISIRS,
    42,
    "pdf-42-1",
    "Elles formeront des artistes épanouis : la réussite des établissements sera mesurée au nombre de personnes qui continuent à pratiquer, seules ou collectivement des années après.",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    40,
    LOISIRS,
    13,
    "pdf-13-1",
    "L’une des conditions impératives de ce projet est de protéger le temps libéré des travailleuses et des travailleurs",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    41,
    PROBITE,
    55,
    "pdf-55-1",
    "La France ne doit plus jamais revivre de scandale Alstom, quitte à nationaliser certaines entreprises stratégiques.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    42,
    PROBITE,
    49,
    "pdf-49-1",
    "Le nom du responsable public contacté devra être déclaré, ainsi que l‘objet de la rencontre, la décision concernée, les articles visés et les documents transmis.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    43,
    PROBITE,
    57,
    "pdf-57-1",
    "nous nous appuierons sur les compétences des agents publics qui connaissent le réel pour le pratiquer au quotidien",
    "REJECT",
    "GENERAL_INTENT",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    44,
    PROBITE,
    49,
    "pdf-49-1",
    "Dans les secteurs stratégiques, nous appliquerons une règle encore plus stricte, inspirée de la logique défendue par l‘OMS en matière de santé publique : lorsque des intérêts privés peuvent entrer directement en conflit avec l‘intérêt général, les contacts avec les décideurs publics devront être interdits, sauf exceptions strictement nécessaires, autorisées, consignées et publiées.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    45,
    PROBITE,
    52,
    "pdf-52-1",
    "Nous la cantonnerons au rôle qui avait été pensé pour elle à ses débuts : sanctionner en France les entreprises françaises coupables d’atteinte à la probité à l’étranger.",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    46,
    PROBITE,
    53,
    "pdf-53-1",
    "Nous restreindrons ainsi la possibilité d’actionner la CJIP pour les seuls faits de corruption entre firmes comportant des éléments d’extranéité.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    47,
    PROBITE,
    55,
    "pdf-55-1",
    "Sera également mis en place un système d’alerte permettant la remontée de signalements de terrain de la part d’acteurs économiques ou de syndicats en cas de menaces d’ingérence.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    48,
    PROBITE,
    45,
    "pdf-45-1",
    "Nous redonnerons la priorité à la promotion interne, en réservant à nouveau ces postes aux fonctionnaires de carrière.",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    49,
    PROBITE,
    57,
    "pdf-57-1",
    "les assemblées disposeront de moyens techniques, humains et d’expertise renforcés pour exercer pleinement leur mission de contrôle de l’exécutif, évaluer les politiques publiques et enquêter sur les dérives du pouvoir",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    50,
    PROBITE,
    42,
    "pdf-42-1",
    "Nous lui donnerons un pouvoir d’enquête renforcé sur les activités réellement réalisées par les anciens ministres et élus, qu’ils créent leur propre cabinet ou qu’ils soient recrutés au sein d’entreprises.",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    51,
    PROBITE,
    50,
    "pdf-50-1",
    "Nous mettrons en place un plafond de dépenses pour les lobbies, afin de permettre aux lobbies non-lucratifs de répondre aux actions d’influence menées par les intérêts économiques puissants.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    52,
    PROBITE,
    50,
    "pdf-50-1",
    "Le contrôle de ce plafond de dépenses, incluant les activités directes et indirectes de lobbying, sera effectué par la Haute Autorité à la Probité.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    53,
    PROBITE,
    54,
    "pdf-54-1",
    "Ce devoir de transparence sera étendu aux privatisations déjà réalisées : les montants versés à ces acteurs externes pour chaque privatisation déjà effectuée seront rendus publics.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    54,
    PROBITE,
    48,
    "pdf-48-1",
    "Nous simplifierons les seuils déclenchant l‘obligation d‘inscription au registre des représentants d‘intérêts",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    55,
    PROBITE,
    45,
    "pdf-45-1",
    "Et pour les hauts fonctionnaires qui feraient le choix de quitter la sphère publique pour rejoindre le privé, le retour dans l’État ne pourra plus servir de porte d’entrée à leurs anciens intérêts. Nous interdirons le rétro-pantouflage : aucun haut fonctionnaire ne pourra revenir dans l’administration, pour mettre fin aux conflits d’intérêts et mettre à distance toute culture décisionnelle favorable aux intérêts privés.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    56,
    PROBITE,
    48,
    "pdf-48-1",
    "Nous étendrons le champ des responsables publics concernés au Président de la République, aux membres du Conseil constitutionnel, du conseil d‘État et de la Cour de cassation — aujourd’hui hors du dispositif",
    "REJECT",
    "MISSING_REFERENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    57,
    PROBITE,
    54,
    "pdf-54-1",
    "Si certaines prestations externes se révèlent être nécessaires, la décision devra être justifiée et publiée, prouvant l’impossibilité de développer l’expertise nécessaire en interne.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    58,
    PROBITE,
    53,
    "pdf-53-1",
    "Pour les autres cas : la justice normale s’appliquera comme elle doit s’appliquer à tous les citoyens !",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    59,
    PROBITE,
    50,
    "pdf-50-1",
    "Un ancien représentant d‘intérêts ne pourra plus rejoindre un cabinet ministériel ou l‘Élysée pour travailler sur un secteur qu‘il défendait auparavant.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    60,
    PROBITE,
    54,
    "pdf-54-1",
    "Nous prendrons en ce sens des mesures afin que les privatisations qui pourraient avoir lieu postérieurement à notre mandat soient encadrées.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
];
