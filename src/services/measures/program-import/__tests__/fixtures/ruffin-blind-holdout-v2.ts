import type {
  BlindHoldoutEditorialReason,
  BlindHoldoutHumanDecision,
  BlindHoldoutRiskCategory,
} from "./ruffin-blind-holdout";

export type RuffinBlindHoldoutV2Entry = {
  id: string;
  documentUrl: string;
  page: number;
  segmentId: string;
  sourceText: string;
  humanDecision: BlindHoldoutHumanDecision;
  editorialReason: BlindHoldoutEditorialReason;
  riskCategory: BlindHoldoutRiskCategory;
};

export const RUFFIN_BLIND_HOLDOUT_V2_VERSION = "ruffin-blind-holdout-v2-pre-reveal-2026-08-16";

export const RUFFIN_BLIND_HOLDOUT_V2_FREEZE = {
  seed: "ruffin-blind-holdout-v2",
  extractor: "2ca9c3fcf6c2d709e6548a40a247cbce621cc66a0f6030044a2d894a130d945e",
  parser: "a2f1ac93ba232ac2ea07ca0d34dc759a2c3491a2917c24622e833b3e3b5f83e2",
  pipeline: "3664f3c37236509a2bec1a66e73bede2c72732b0190dc8f1d268af9f752c465b",
  policy: "44e1ee6249d406c14627955df49c58987cf213dc39edfafd4f09a1f5fa3d42fa",
  types: "5a1799162359cdb8dd1cecba4bf9b7f2edb66d2f8c09ecf49afe916cca919a56",
  report: "ea6d799ad8ee5f1070e1d8ad60c270a399c0b5b8e0f402c384a72173b879f791",
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
): RuffinBlindHoldoutV2Entry {
  return {
    id: `blind-v2-${id}`,
    documentUrl,
    page,
    segmentId,
    sourceText,
    humanDecision,
    editorialReason,
    riskCategory,
  };
}

// Annotations réalisées à partir des seules citations, sans classification, garde ni décision
// du pipeline. Cette fixture devient immuable avant l'unique révélation v2.
export const RUFFIN_BLIND_HOLDOUT_V2: RuffinBlindHoldoutV2Entry[] = [
  entry(
    1,
    TRAVAIL,
    2,
    "pdf-2-1",
    "Nous portons ce mot d’ordre simple : que tous les Français, que toutes les Françaises puissent vivre de leur travail, bien en vivre, et pas seulement en survivre.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    2,
    TRAVAIL,
    17,
    "pdf-17-1",
    "Proposition 2 COMPTABILISER LES HEURES DE TRAVAIL INVISIBLES ET RÉDUIRE L’AMPLITUDE HORAIRE DES JOURNÉES. Nous voulons mieux protéger les salariés dont le temps de [...] Pour décourager les employeurs de recourir aux journées à trous, nous voulons actionner plusieurs leviers : ● I nstaurer le principe d’une durée de service minimale.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "QUANTIFIED_ACTION"
  ),
  entry(
    3,
    TRAVAIL,
    2,
    "pdf-2-1",
    "que tous les Français, que toutes les Françaises puissent [...] bien le vivre et non en souffrir.",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    4,
    TRAVAIL,
    6,
    "pdf-6-1",
    "C’est cette hiérarchie que nous voulons remettre en cause, pour que les distinctions sociales reflètent bien l’utilité sociale !",
    "REJECT",
    "GENERAL_INTENT",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    5,
    TRAVAIL,
    17,
    "pdf-17-1",
    "Proposition 2 COMPTABILISER LES HEURES DE TRAVAIL INVISIBLES ET RÉDUIRE L’AMPLITUDE HORAIRE DES JOURNÉES.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "TITLE_OR_SLOGAN"
  ),
  entry(
    6,
    TRAVAIL,
    21,
    "pdf-21-1",
    "Nous voulons donc en finir avec ce détournement du droit",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    7,
    TRAVAIL,
    11,
    "pdf-11-1",
    "Car nous voulons que « ces hommes et ces femmes que nos économies reconnaissent et rémunèrent si mal » obtiennent une reconnaissance pleine et entière, dans les statuts et les revenus, dans les horaires, les salaires, les carrières.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    8,
    TRAVAIL,
    5,
    "pdf-5-1",
    "en 2024, la ministre du Travail Catherine Vautrin annonçait encore un durcissement au nom des économies et de l’emploi.",
    "REJECT",
    "HISTORICAL_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    9,
    TRAVAIL,
    5,
    "pdf-5-1",
    "Les gouvernements successifs ont ainsi opéré un grand renversement dans ce que les juristes appellent la « hiérarchie des normes » : les accords d’entreprise priment désormais sur les accords de branche et a fortiori sur le code du travail pour déterminer les règles applicables dans l’entreprise. Et ce, y compris si les règles négociées sont moins favorables que la loi.",
    "REJECT",
    "EXISTING_POLICY_DESCRIPTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    10,
    TRAVAIL,
    6,
    "pdf-6-1",
    "Ces travailleurs et travailleuses de la première ligne ont des salaires inférieurs en moyenne de 30 % à l’ensemble des salariés",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    11,
    TRAVAIL,
    6,
    "pdf-6-1",
    "Mais comment évaluer cette « valeur sociale » ou cette « utilité commune », pour reprendre les mots de la Constitution ?",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    12,
    TRAVAIL,
    11,
    "pdf-11-1",
    "On n’est pas des bêtes. On n’est pas des boniches. On veut juste être reconnues pour ce qu’on fait.",
    "REJECT",
    "THIRD_PARTY_PROPOSAL",
    "THIRD_PARTY_OR_QUOTATION"
  ),
  entry(
    13,
    TRAVAIL,
    6,
    "pdf-6-1",
    "La crise sanitaire a révélé que la hiérarchie des salaires était inversée par rapport à celle des métiers : les professions les plus utiles socialement sont en bas de l’échelle salariale tandis que les « bullshit jobs » sont majoritairement en haut.",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    14,
    TRAVAIL,
    4,
    "pdf-4-1",
    "DES MÉTIERS DONT L’ACTIVITÉ NE PEUT ÊTRE INTERROMPUE MÊME EN CAS DE CRISE GRAVE",
    "REJECT",
    "TITLE_ONLY",
    "TITLE_OR_SLOGAN"
  ),
  entry(
    15,
    TRAVAIL,
    22,
    "pdf-22-1",
    "La ville de Londres a mis en place à partir du début des années 2000 des programmes d’aide au logement dans les grandes villes pour les « travailleurs clefs ».",
    "REJECT",
    "EXISTING_POLICY_DESCRIPTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    16,
    TRAVAIL,
    16,
    "pdf-16-1",
    "Aujourd’hui, il existe à la fois un encadrement strict du travail heures réalisées en horaires atypiques pour dissuader les de nuit et des compensations (de repos ou financières) pour celles et ceux qui sont concernés.",
    "REJECT",
    "PARSER_CORRUPTION",
    "PARSER_GROUNDING"
  ),
  entry(
    17,
    TRAVAIL,
    20,
    "pdf-20-1",
    "Qui est concerné ? 4,4 millions de salariés qui déclarent une des formes de pénibilité correspondant au compte personnel de prévention de la pénibilité (C3P).",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    18,
    TRAVAIL,
    16,
    "pdf-16-1",
    "Pour les travailleurs en horaires atypiques, c’est encore la double peine : leurs horaires sont, par bien des aspects, aussi pénibles que le travail de nuit mais ils ne font l’objet d’aucune compensation en termes de repos ou de majoration.",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    19,
    TRAVAIL,
    23,
    "pdf-23-1",
    "nous avons besoin d’un programme ancré dans la continuité des acquis du Nouveau Front Populaire",
    "REJECT",
    "GENERAL_INTENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    20,
    TRAVAIL,
    14,
    "pdf-14-1",
    "Parce qu’on ne peut pas demander à quelqu’un de tenir toute une vie dans des métiers qui cassent les corps sans jamais lui ouvrir d’issue.",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    21,
    PROBITE,
    53,
    "pdf-53-1",
    "Finie la possibilité pour le groupe Bolloré d’essayer de ne pas assumer ses actions de corruption en Afrique.",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    22,
    PROBITE,
    53,
    "pdf-53-1",
    "Finie pour Nestlé Waters la possibilité d’empoisonner nos eaux et nos sols en toute impunité.",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    23,
    PROBITE,
    37,
    "pdf-37-1",
    "Nous renforcerons également les garanties de probité qui sont exigées d’un candidat à la présidence de la République et d’un ministre en devenir : pas de délit financier au casier judiciaire, prouver qu’il est à jour du paiement de ses impôts et démontrer qu’il n’est soumis à aucun conflit d’intérêts au début, mais également tout au long de son mandat.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    24,
    PROBITE,
    47,
    "pdf-47-1",
    "Toute mission de conseil commandée par l’État ou ses opérateurs devra être publiée : objet, cabinet retenu, montant, durée, commanditaire, livrables produits et suites données aux recommandations.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    25,
    PROBITE,
    52,
    "pdf-52-1",
    "Nous abrogerons cette possibilité laissée aux plus riches d’échapper à leur responsabilité.",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    26,
    PROBITE,
    55,
    "pdf-55-1",
    "Nous mettrons fin au démantèlement du pays en supprimant le droit du ministre de l’Économie de décider, seul, de l’avenir des fleurons de la nation.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    27,
    PROBITE,
    54,
    "pdf-54-1",
    "l’État sera dans l’obligation de rendre publics les montants versés aux cabinets de conseil, banquiers et avocats d’affaires, afin de désinciter davantage les décideurs publics à utiliser ces acteurs externes.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    28,
    PROBITE,
    54,
    "pdf-54-1",
    "la loi obligera l’État à utiliser son expertise interne pour préparer une privatisation.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    29,
    PROBITE,
    43,
    "pdf-43-1",
    "Dans les dix premières années suivant le départ du Gouvernement, les ministres seront soumis à une période de refroidissement renforcée, sur le modèle néerlandais. Aucun ministre, conseiller ministériel ou haut fonctionnaire ne pourra aller faire des relations publiques, du conseil, du lobbiyng, ni avoir son propre cabinet de conseil ou cabinet d’avocat auprès d’administrations ou d’entreprises qui auront eu un lien avec ses responsabilités précédentes.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "QUANTIFIED_ACTION"
  ),
  entry(
    30,
    PROBITE,
    51,
    "pdf-51-1",
    "Le garde des Sceaux continuera à définir les grandes orientations de la politique judiciaire de la Nation, qu’il s’agisse par exemple de renforcer la protection des enfants, de lutter contre les violences faites aux femmes ou de combattre la criminalité organisée",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    31,
    PROBITE,
    42,
    "pdf-42-1",
    "Cette autorité sera indépendante, davantage dotée de moyens humains et financiers.",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    32,
    PROBITE,
    55,
    "pdf-55-1",
    "La décision du ministre de l’Économie sera soumise à la commission des affaires économiques de l’Assemblée nationale avant validation.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    33,
    PROBITE,
    42,
    "pdf-42-1",
    "nous lui donnerons des pouvoirs de sanction administrative, pour qu’elle puisse sanctionner les individus qui ne respecteraient pas ses recommandations (ruptures de contrat, sanctions pécuniaires, interdictions de postuler à des marchés publics pour les entreprises recruteuses).",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    34,
    PROBITE,
    49,
    "pdf-49-1",
    "Enfin, tout cadeau, invitation ou avantage de quelque nature que ce soit sera interdit lorsqu’il provient d’un représentant d’intérêts et vise un responsable public.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    35,
    PROBITE,
    40,
    "pdf-40-1",
    "Au-delà de l’incompatibilité d’agenda entre ces deux fonctions, il importe qu’un ministre ne puisse pas donner le sentiment que certaines de ses décisions pourraient être indûment influencées par la prise en compte d’un intérêt local.",
    "REJECT",
    "GENERAL_INTENT",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    36,
    PROBITE,
    45,
    "pdf-45-1",
    "La loi du 6 août 2019, en contractualisant les emplois supérieurs, a structurellement privé les hauts fonctionnaires d’une partie de leurs perspectives de carrière, les poussant d’autant plus vers le secteur privé.",
    "REJECT",
    "HISTORICAL_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    37,
    PROBITE,
    2,
    "pdf-2-1",
    "« Crime contre la Nation. » L’expression figure dans le jugement rendu, en première instance, contre Nicolas Sarkozy.",
    "REJECT",
    "DIAGNOSIS",
    "THIRD_PARTY_OR_QUOTATION"
  ),
  entry(
    38,
    PROBITE,
    16,
    "pdf-16-1",
    "une majorité de parlementaires s’est exprimée contre (52 pour, 58 contre) mais elle n’a pas suffi à bloquer ce caprice présidentiel.",
    "REJECT",
    "DIAGNOSIS",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    39,
    PROBITE,
    2,
    "pdf-2-1",
    "Et pourtant, à peine sorti du tribunal, où Nicolas Sarkozy fut-il reçu ? À l’Élysée, aux côtés d’Emmanuel Macron.",
    "REJECT",
    "RHETORICAL_FORMULATION",
    "RHETORICAL_OR_HEADING"
  ),
  entry(
    40,
    PROBITE,
    4,
    "pdf-4-1",
    "nos  CONSTATS  LES PUISSANCES DE L’ARGENT  ONT ENVAHI L’ÉTAT.",
    "REJECT",
    "DIAGNOSIS",
    "TITLE_OR_SLOGAN"
  ),
  entry(
    41,
    LOISIRS,
    28,
    "pdf-28-1",
    "Nous simplifierons le labyrinthe administratif, en créant un guichet unique des subventions, accessible en ligne et doté d’un point d’accueil physique dans chaque canton",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    42,
    LOISIRS,
    39,
    "pdf-39-1",
    "1 / Prêt de matériel au sein des médiathèques publiques, permettant à chacun de découvrir une activité ou un art (instruments de musique, machines à coudre et matériel de loisirs créatifs, outils de bricolage et de jardinage, équipements sportifs, etc.).",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "QUANTIFIED_ACTION"
  ),
  entry(
    43,
    LOISIRS,
    35,
    "pdf-35-1",
    "Un portail unique recensera l’ensemble des ateliers, marchés locaux, et savoir-faire locaux.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    44,
    LOISIRS,
    29,
    "pdf-29-1",
    "Nous créerons un véritable statut du dirigeant et du bénévole associatif, ouvrant droit à un congé bénévole sans perte de salaire, à un congé de formation, et à la validation de trimestres de retraite au titre de l’engagement associatif.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    45,
    LOISIRS,
    32,
    "pdf-32-1",
    "nous mettrons en place un « billet populaire » illimité à 29 euros sur le réseau TER national, du 1er juillet au 31 août.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "QUANTIFIED_ACTION"
  ),
  entry(
    46,
    LOISIRS,
    31,
    "pdf-31-1",
    "Nous simplifierons l’accès aux aides.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    47,
    LOISIRS,
    13,
    "pdf-13-1",
    "assurer une stabilité du temps de travail, pour que chacune et chacun puisse organiser sa vie, accompagner ses enfants ou participer lui-même à des activités",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    48,
    LOISIRS,
    42,
    "pdf-42-1",
    "Nous travaillerons aussi à ouvrir davantage l’enseignement de la danse, de la musique, des arts en général.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    49,
    LOISIRS,
    3,
    "pdf-3-1",
    "le moyen pour y parvenir, le principal moyen (mais non le seul), ce sont les associations, qu’elles se sachent encouragées, appuyées. Qu’on leur assure, côté financement, de la stabilité dans la durée.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    50,
    LOISIRS,
    38,
    "pdf-38-1",
    "Nous rétablirons et augmenterons cette part collective, la plus équitable du dispositif puisqu’elle touche tous les élèves d’un établissement, y compris ceux les plus éloignés de l’offre culturelle, contrairement à la part individuelle qui repose sur l’initiative de chacun.",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    51,
    LOISIRS,
    31,
    "pdf-31-1",
    "Sur le modèle de ce qu’a expérimenté la ville de Trappes, nous proposerons un droit garantissant que chaque enfant français bénéficie d’au moins un séjour collectif, en colos, financé pendant la scolarité obligatoire, sans démarche à effectuer par les familles.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    52,
    LOISIRS,
    32,
    "pdf-32-1",
    "Nous irons vers les adolescents dans les zones rurales et populaires sur le temps des vacances scolaires.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    53,
    LOISIRS,
    14,
    "pdf-14-1",
    "La priorité des structures culturelles, au-delà de leur rôle de programmation, de conservation du patrimoine et de soutien à la création, doit être de permettre aux habitants de pratiquer, de participer, de créer.",
    "ACCEPT_OBJECTIVE",
    "EXPLICIT_TARGET_WITHOUT_MEANS",
    "OBJECTIVE_WITHOUT_MEANS"
  ),
  entry(
    54,
    LOISIRS,
    31,
    "pdf-31-1",
    "Nous fusionnerons les dispositifs existants (AVF, AVE, Pass Colo, colos apprenantes, bons CAF) en un guichet unique, avec une notification automatique des droits aux familles éligibles, sans qu’elles aient à en faire la demande ni à connaître l’existence de chaque dispositif.",
    "ACCEPT_MEASURE",
    "EXPLICIT_ACTION",
    "EXPLICIT_ACTION"
  ),
  entry(
    55,
    LOISIRS,
    29,
    "pdf-29-1",
    "Ces emplois aidés seront fléchés vers le monde associatif, dans l’éducation populaire, le sport pour tous, la culture de proximité, le social et l’environnement.",
    "REJECT",
    "DEPENDENT_FRAGMENT",
    "SHORT_OR_FRAGMENT"
  ),
  entry(
    56,
    LOISIRS,
    7,
    "pdf-7-1",
    "Christelle Morançais a annoncé en 2024 un plan d’économies qui a fortement amputé les financements accordés aux festivals, compagnies et associations culturelles",
    "REJECT",
    "HISTORICAL_ACTION",
    "HISTORICAL_OR_EXISTING"
  ),
  entry(
    57,
    LOISIRS,
    5,
    "pdf-5-1",
    "Les Françaises et Français lisent moins régulièrement qu’il y a dix ans, tout comme ils dorment de moins en moins !",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    58,
    LOISIRS,
    36,
    "pdf-36-1",
    "Ce secteur, ce sont 250 000 entreprises et 19 milliards d’euros de chiffre d’affaires, sans compter le tourisme et la fierté qu’il génère, localement et nationalement.",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    59,
    LOISIRS,
    8,
    "pdf-8-1",
    "Pour beaucoup de familles, inscrire deux enfants au football, à la danse ou à la musique représente plusieurs centaines d’euros par an, auxquels s’ajoutent l’achat du matériel ou le déplacement en compétitions du week-end.",
    "REJECT",
    "DIAGNOSIS",
    "DIAGNOSIS_OR_VALUE"
  ),
  entry(
    60,
    LOISIRS,
    7,
    "pdf-7-1",
    "la « création » continue de trôner comme unique alpha et oméga des politiques culturelles",
    "REJECT",
    "DIAGNOSIS",
    "SHORT_OR_FRAGMENT"
  ),
];
