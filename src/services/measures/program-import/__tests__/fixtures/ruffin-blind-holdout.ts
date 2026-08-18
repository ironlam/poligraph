export type BlindHoldoutHumanDecision = "ACCEPT_MEASURE" | "ACCEPT_OBJECTIVE" | "REJECT";

export type BlindHoldoutEditorialReason =
  | "EXPLICIT_ACTION"
  | "EXPLICIT_TARGET_WITHOUT_MEANS"
  | "TITLE_ONLY"
  | "VALUE"
  | "DIAGNOSIS"
  | "HISTORICAL_ACTION"
  | "THIRD_PARTY_PROPOSAL"
  | "EXISTING_POLICY_DESCRIPTION"
  | "RHETORICAL_FORMULATION"
  | "DEPENDENT_FRAGMENT"
  | "MISSING_REFERENT"
  | "INSUFFICIENT_ATTRIBUTION"
  | "GENERAL_INTENT"
  | "PARSER_CORRUPTION"
  | "OTHER";

export type BlindHoldoutRiskCategory =
  | "EXPLICIT_ACTION"
  | "QUANTIFIED_ACTION"
  | "OBJECTIVE_WITHOUT_MEANS"
  | "TITLE_OR_SLOGAN"
  | "HISTORICAL_OR_EXISTING"
  | "THIRD_PARTY_OR_QUOTATION"
  | "DIAGNOSIS_OR_VALUE"
  | "RHETORICAL_OR_HEADING"
  | "SHORT_OR_FRAGMENT"
  | "PARSER_GROUNDING"
  | "OTHER";

export type RuffinBlindHoldoutEntry = {
  id: string;
  documentUrl: string;
  page: number;
  segmentId: string;
  sourceText: string;
  humanDecision: BlindHoldoutHumanDecision;
  editorialReason: BlindHoldoutEditorialReason;
  riskCategory: BlindHoldoutRiskCategory;
};

export const RUFFIN_BLIND_HOLDOUT_VERSION = "ruffin-blind-holdout-v1-pre-reveal-2026-08-16";

const TRAVAIL_URL =
  "https://nouspresident.fr/wp-content/uploads/2026/04/Debout-Livret-Campagne_Web.pdf";
const PROBITE_URL =
  "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Probite-Web-1.pdf";
const LOISIRS_URL =
  "https://nouspresident.fr/wp-content/uploads/2026/07/Debout-Livret-Campagne-Loisirs-vdef-Web.pdf";

// Ces décisions éditoriales ont été annotées à partir des seules citations, avant révélation
// de modelClassification, accepted et des gardes du rapport canonique.
export const RUFFIN_BLIND_HOLDOUT: RuffinBlindHoldoutEntry[] = [
  {
    id: "blind-1",
    documentUrl: TRAVAIL_URL,
    page: 12,
    segmentId: "pdf-12-1",
    sourceText:
      "La puissance publique doit désormais, plus que jamais, prendre ses responsabilités et offrir aux salariés de la première ligne un statut et un revenu dignes du service apporté à la collectivité.",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-2",
    documentUrl: TRAVAIL_URL,
    page: 22,
    segmentId: "pdf-22-1",
    sourceText:
      "Nous proposons une sur-cotisation au fond du 1 % patronal pour les entreprises qui embauchent des travailleurs essentiels et recourent massivement aux horaires atypiques.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-3",
    documentUrl: TRAVAIL_URL,
    page: 15,
    segmentId: "pdf-15-1",
    sourceText:
      "Pour en finir avec cette érosion du pouvoir d’achat, nous indexerons les salaires sur l’inflation",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-4",
    documentUrl: TRAVAIL_URL,
    page: 20,
    segmentId: "pdf-20-1",
    sourceText:
      "E n déployant un plan de formation national des travailleuses et travailleurs essentiels.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "PARSER_GROUNDING",
  },
  {
    id: "blind-5",
    documentUrl: TRAVAIL_URL,
    page: 17,
    segmentId: "pdf-17-1",
    sourceText:
      "COMPTABILISER LES HEURES DE TRAVAIL INVISIBLES ET RÉDUIRE L’AMPLITUDE HORAIRE DES JOURNÉES.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "TITLE_OR_SLOGAN",
  },
  {
    id: "blind-6",
    documentUrl: TRAVAIL_URL,
    page: 21,
    segmentId: "pdf-21-1",
    sourceText:
      "Nous voulons donc en finir avec ce détournement du droit l’industrie) qui renouvellent incessamment les contrats d’intérim de 3x6 mois.",
    humanDecision: "REJECT",
    editorialReason: "PARSER_CORRUPTION",
    riskCategory: "PARSER_GROUNDING",
  },
  {
    id: "blind-7",
    documentUrl: TRAVAIL_URL,
    page: 21,
    segmentId: "pdf-21-1",
    sourceText: "ASSURER LA PORTABILITÉ DES DROITS POUR LES SALARIÉS ESSENTIELS ET SOUS-TRAITANTS",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "TITLE_OR_SLOGAN",
  },
  {
    id: "blind-8",
    documentUrl: TRAVAIL_URL,
    page: 15,
    segmentId: "pdf-15-1",
    sourceText: "nous revaloriserons les grilles de classification",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-9",
    documentUrl: TRAVAIL_URL,
    page: 2,
    segmentId: "pdf-2-1",
    sourceText:
      "Celles et ceux à qui le président de la République avait promis « reconnaissance et rémunération », mais qui n’ont rien vu venir",
    humanDecision: "REJECT",
    editorialReason: "HISTORICAL_ACTION",
    riskCategory: "HISTORICAL_OR_EXISTING",
  },
  {
    id: "blind-10",
    documentUrl: TRAVAIL_URL,
    page: 12,
    segmentId: "pdf-12-1",
    sourceText:
      "Nous voulons protéger en priorité celles et ceux qui n’ont pas de statut au sein du secteur privé, ces métiers ubérisés, atomisés sur le marché du travail ultra-concurrentiel et particulièrement exposés à la sous-traitance et à l’intérim.",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-11",
    documentUrl: TRAVAIL_URL,
    page: 7,
    segmentId: "pdf-7-1",
    sourceText:
      "On a des contrats à temps partiel : 110 heures, parfois 135 heures… Mais avec l’amplitude et les trajets, on travaille largement plus qu’un temps plein.",
    humanDecision: "REJECT",
    editorialReason: "THIRD_PARTY_PROPOSAL",
    riskCategory: "THIRD_PARTY_OR_QUOTATION",
  },
  {
    id: "blind-12",
    documentUrl: TRAVAIL_URL,
    page: 17,
    segmentId: "pdf-17-1",
    sourceText:
      "Pour décourager les employeurs de recourir aux journées à trous, nous voulons actionner plusieurs leviers",
    humanDecision: "REJECT",
    editorialReason: "DEPENDENT_FRAGMENT",
    riskCategory: "RHETORICAL_OR_HEADING",
  },
  {
    id: "blind-13",
    documentUrl: TRAVAIL_URL,
    page: 23,
    segmentId: "pdf-23-1",
    sourceText:
      "mettre enfin au cœur de la campagne ces femmes et ces hommes qui tiennent le pays debout",
    humanDecision: "REJECT",
    editorialReason: "GENERAL_INTENT",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-14",
    documentUrl: TRAVAIL_URL,
    page: 12,
    segmentId: "pdf-12-1",
    sourceText:
      "le déséquilibre dans le rapport de force entre les employeurs et les salariés ne permettra pas d’améliorer suffisamment les conditions de travail",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-15",
    documentUrl: TRAVAIL_URL,
    page: 21,
    segmentId: "pdf-21-1",
    sourceText: "ENCADRER LE RECOURS À LA SOUS-TRAITANCE ET À L’INTÉRIM",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "TITLE_OR_SLOGAN",
  },
  {
    id: "blind-16",
    documentUrl: TRAVAIL_URL,
    page: 5,
    segmentId: "pdf-5-1",
    sourceText:
      "Et pendant qu’on demandait aux gens de « reprendre un emploi », on a durci l’assurance-chômage par décrets – Pénicaud en 2019, puis Élisabeth Borne en 2021.",
    humanDecision: "REJECT",
    editorialReason: "HISTORICAL_ACTION",
    riskCategory: "HISTORICAL_OR_EXISTING",
  },
  {
    id: "blind-17",
    documentUrl: TRAVAIL_URL,
    page: 10,
    segmentId: "pdf-10-1",
    sourceText:
      "leur utilité sociale est partout – dans l’hygiène, le soin, l’alimentation, la sécurité, le lien – mais leur reconnaissance, elle, est quasiment nulle part",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-18",
    documentUrl: TRAVAIL_URL,
    page: 15,
    segmentId: "pdf-15-1",
    sourceText:
      "Des mesures ont été adoptées pour revaloriser le salaire minimum au-dessus du minimum légal des professionnels de la dépendance, qui s’occupent de nos aînés. Des congés payés supplémentaires sont également accordés à ces travailleurs, au-delà du minimum légal en vigueur (9 jours de congés",
    humanDecision: "REJECT",
    editorialReason: "EXISTING_POLICY_DESCRIPTION",
    riskCategory: "HISTORICAL_OR_EXISTING",
  },
  {
    id: "blind-19",
    documentUrl: TRAVAIL_URL,
    page: 19,
    segmentId: "pdf-19-1",
    sourceText: "C’est pas compté comme du temps de travail ?",
    humanDecision: "REJECT",
    editorialReason: "RHETORICAL_FORMULATION",
    riskCategory: "RHETORICAL_OR_HEADING",
  },
  {
    id: "blind-20",
    documentUrl: TRAVAIL_URL,
    page: 7,
    segmentId: "pdf-7-1",
    sourceText: "Ils sont deux fois plus souvent en CDD ou en intérim.",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-21",
    documentUrl: PROBITE_URL,
    page: 49,
    segmentId: "pdf-49-1",
    sourceText:
      "Les notes, argumentaires et propositions communiqués par les représentants d‘intérêts aux pouvoirs publics seront rendus publics, à l’image de ce qui existe depuis des années déjà en Estonie.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "HISTORICAL_OR_EXISTING",
  },
  {
    id: "blind-22",
    documentUrl: PROBITE_URL,
    page: 43,
    segmentId: "pdf-43-1",
    sourceText:
      "Aucun ministre, conseiller ministériel ou haut fonctionnaire ne pourra aller faire des relations publiques, du conseil, du lobbiyng, ni avoir son propre cabinet de conseil ou cabinet d’avocat auprès d’administrations ou d’entreprises qui auront eu un lien avec ses responsabilités précédentes.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-23",
    documentUrl: PROBITE_URL,
    page: 42,
    segmentId: "pdf-42-1",
    sourceText:
      "la durée de droit de regard à l’issue du changement de carrière sera étendue à 5 ans.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-24",
    documentUrl: PROBITE_URL,
    page: 45,
    segmentId: "pdf-45-1",
    sourceText:
      "pour mettre fin aux conflits d’intérêts et mettre à distance toute culture décisionnelle favorable aux intérêts privés",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-25",
    documentUrl: PROBITE_URL,
    page: 41,
    segmentId: "pdf-41-1",
    sourceText:
      "L’ensemble de ces organes sera fusionné pour former la Haute Autorité à la Probité.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-26",
    documentUrl: PROBITE_URL,
    page: 48,
    segmentId: "pdf-48-1",
    sourceText:
      "Si un parlementaire relaie un amendement proposé ou rédigé par un lobby, il devra en mentionner l‘origine",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "THIRD_PARTY_OR_QUOTATION",
  },
  {
    id: "blind-27",
    documentUrl: PROBITE_URL,
    page: 48,
    segmentId: "pdf-48-1",
    sourceText:
      "Pour chaque projet de loi, et pour les décrets ou arrêtés structurants, une fiche publique indiquera qui a été consulté, qui a été rencontré, sur quels articles, et quelles contributions ont été reçues : notes, rapports, propositions, amendements",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-28",
    documentUrl: PROBITE_URL,
    page: 37,
    segmentId: "pdf-37-1",
    sourceText:
      "Enfin, tous seront soumis à la même justice que l’ensemble des citoyens français. Nous mettrons fin à l’inviolabilité pénale et civile complète du Président de la République et au privilège de juridiction des ministres.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-29",
    documentUrl: PROBITE_URL,
    page: 53,
    segmentId: "pdf-53-1",
    sourceText:
      "Pour mettre fin au pouvoir exorbitant de nominations du Président de la République, nous proposons de revoir l’article 13 de la Constitution pour que les parlementaires puissent s’opposer à une nomination à une majorité simple.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-30",
    documentUrl: PROBITE_URL,
    page: 37,
    segmentId: "pdf-37-1",
    sourceText:
      "Pour ce faire, nous prendrons exemple sur certains de nos amis scandinaves qui forcent notamment leurs responsables politiques à faire gérer leurs actifs financiers par un tiers indépendant, sans information au propriétaire.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "THIRD_PARTY_OR_QUOTATION",
  },
  {
    id: "blind-31",
    documentUrl: PROBITE_URL,
    page: 45,
    segmentId: "pdf-45-1",
    sourceText: "nous renforcerons le statut des fonctionnaires",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-32",
    documentUrl: PROBITE_URL,
    page: 53,
    segmentId: "pdf-53-1",
    sourceText:
      "Nous proposons un modèle moins vertical de nomination, notamment pour les établissements publics dont les dirigeants pourraient être nommés par un collège préexistant ou ad hoc selon une procédure publique et collégiale.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-33",
    documentUrl: PROBITE_URL,
    page: 43,
    segmentId: "pdf-43-1",
    sourceText:
      "Les avis seront publics et les interdictions seront assorties de sanctions effectives.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-34",
    documentUrl: PROBITE_URL,
    page: 47,
    segmentId: "pdf-47-1",
    sourceText: "Nous mettrons fin à l’opacité des prestations privées.",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-35",
    documentUrl: PROBITE_URL,
    page: 47,
    segmentId: "pdf-47-1",
    sourceText:
      "Lorsqu’une administration devra exceptionnellement recourir à un cabinet de conseil, elle aura l’obligation de développer en parallèle les compétences correspondantes en interne afin de pouvoir assumer elle-même ces missions à l’avenir.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-36",
    documentUrl: PROBITE_URL,
    page: 15,
    segmentId: "pdf-15-1",
    sourceText:
      "Alain Griset, pour avoir déclaré « de manière incomplète ou mensongère » sa situation patrimoniale et ses intérêts à la HATVP, a été condamné à quatre mois de prison avec sursis et à trois ans d’inéligibilité avec sursis",
    humanDecision: "REJECT",
    editorialReason: "HISTORICAL_ACTION",
    riskCategory: "HISTORICAL_OR_EXISTING",
  },
  {
    id: "blind-37",
    documentUrl: PROBITE_URL,
    page: 15,
    segmentId: "pdf-15-1",
    sourceText:
      "Marlène Schiappa est visée par une information judiciaire du PNF pour « détournement de fonds publics par négligence », « abus de confiance » et « prise illégale d’intérêts » dans le cadre du fonds Marianne",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-38",
    documentUrl: PROBITE_URL,
    page: 9,
    segmentId: "pdf-9-1",
    sourceText:
      "Cette « marchandisation généralisée » est rendue possible par des hauts fonctionnaires qui, à l’issue de ces privatisations, pantouflent en dirigeant ces entreprises et forment une caste affairiste qui se renouvelle ensuite à la tête des entreprises du CAC 40.",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-39",
    documentUrl: PROBITE_URL,
    page: 56,
    segmentId: "pdf-56-1",
    sourceText:
      "Comment lutter efficacement contre la fraude fiscale si les hauts fonctionnaires pensent d’abord à leur suite de carrière dans les banques ?",
    humanDecision: "REJECT",
    editorialReason: "RHETORICAL_FORMULATION",
    riskCategory: "RHETORICAL_OR_HEADING",
  },
  {
    id: "blind-40",
    documentUrl: PROBITE_URL,
    page: 9,
    segmentId: "pdf-9-1",
    sourceText: "Ces liens entre pouvoir et argent sont aujourd’hui systémiques.",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-41",
    documentUrl: LOISIRS_URL,
    page: 6,
    segmentId: "pdf-6-1",
    sourceText:
      "un troisième étage doit encore être construit : que le peuple ne soit plus seulement spectateur ou pratiquant, mais acteur et décideur des pratiques culturelles qu’il désire.",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-42",
    documentUrl: LOISIRS_URL,
    page: 31,
    segmentId: "pdf-31-1",
    sourceText:
      "1 / Nous instaurerons un droit automatique à un premier départ collectif. Sur le modèle de ce qu’a expérimenté la ville de Trappes, nous proposerons un droit garantissant que chaque enfant français bénéficie d’au moins un séjour collectif, en colos, financé pendant la scolarité obligatoire, sans démarche à effectuer par les familles.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-43",
    documentUrl: LOISIRS_URL,
    page: 42,
    segmentId: "pdf-42-1",
    sourceText:
      "Ceci dans le cadre d’un cogestion entre organismes publics, réseaux associatifs et usagers.",
    humanDecision: "REJECT",
    editorialReason: "DEPENDENT_FRAGMENT",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-44",
    documentUrl: LOISIRS_URL,
    page: 13,
    segmentId: "pdf-13-1",
    sourceText:
      "L’une des conditions impératives de ce projet est de protéger le temps libéré des travailleuses et des travailleurs, et d’assurer une stabilité du temps de travail, pour que chacune et chacun puisse organiser sa vie, accompagner ses enfants ou participer lui-même à des activités.",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-45",
    documentUrl: LOISIRS_URL,
    page: 29,
    segmentId: "pdf-29-1",
    sourceText:
      "Nous rétablirons des contrats aidés dédiés, avec l’embauche de 60 000 postes pris en charge par l’État pour épauler les associations dans leurs démarches administratives, mutualisés à l’échelle des communes et intercommunalités.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-46",
    documentUrl: LOISIRS_URL,
    page: 7,
    segmentId: "pdf-7-1",
    sourceText: "rendre effectifs les droits culturels",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-47",
    documentUrl: LOISIRS_URL,
    page: 14,
    segmentId: "pdf-14-1",
    sourceText:
      "C’est pourquoi nous en faisons un objectif politique à part entière : chacun doit pouvoir pratiquer, créer, apprendre, voyager, rencontrer les autres et s’engager, quels que soient ses revenus ou son adresse.",
    humanDecision: "ACCEPT_OBJECTIVE",
    editorialReason: "EXPLICIT_TARGET_WITHOUT_MEANS",
    riskCategory: "OBJECTIVE_WITHOUT_MEANS",
  },
  {
    id: "blind-48",
    documentUrl: LOISIRS_URL,
    page: 29,
    segmentId: "pdf-29-1",
    sourceText:
      "Nous garantirons l’accès de toutes et tous au sport et aux loisirs, en prenant en charge la moitié du coût des licences au-delà du Pass’Sport pour les familles modestes, et en finançant l’embauche d’animateurs pour les accueils de loisirs, alors qu’il en a manqué 40 000 l’été dernier pour encadrer deux millions d’enfants.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-49",
    documentUrl: LOISIRS_URL,
    page: 21,
    segmentId: "pdf-21-1",
    sourceText: "Diplôme pour devenir animateur.",
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE_OR_SLOGAN",
  },
  {
    id: "blind-50",
    documentUrl: LOISIRS_URL,
    page: 28,
    segmentId: "pdf-28-1",
    sourceText:
      "et en généralisant les subventions pluriannuelles de fonctionnement plutôt que les appels à projets ponctuels.",
    humanDecision: "REJECT",
    editorialReason: "DEPENDENT_FRAGMENT",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-51",
    documentUrl: LOISIRS_URL,
    page: 31,
    segmentId: "pdf-31-1",
    sourceText:
      "2 / Nous simplifierons l’accès aux aides. Nous fusionnerons les dispositifs existants (AVF, AVE, Pass Colo, colos apprenantes, bons CAF) en un guichet unique, avec une notification automatique des droits aux familles éligibles, sans qu’elles aient à en faire la demande ni à connaître l’existence de chaque dispositif.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-52",
    documentUrl: LOISIRS_URL,
    page: 29,
    segmentId: "pdf-29-1",
    sourceText: "Nous ferons de la subvention la norme, et de l’appel à projets l’exception.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-53",
    documentUrl: LOISIRS_URL,
    page: 35,
    segmentId: "pdf-35-1",
    sourceText:
      "Nous poursuivrons la présence des grandes institutions culturelles nationales en région pendant les vacances scolaires.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "EXPLICIT_ACTION",
  },
  {
    id: "blind-54",
    documentUrl: LOISIRS_URL,
    page: 35,
    segmentId: "pdf-35-1",
    sourceText:
      "Nous étendrons la bonne pratique des Micro-Folies : chaque grande institution nationale financée sur fonds publics devra consacrer 25 % du budget de sa programmation itinérante (exposition, spectacle, résidence d’artiste) à une tournée en régions, dans des lieux qui n’ont pas les moyens de faire venir ces œuvres autrement.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "QUANTIFIED_ACTION",
  },
  {
    id: "blind-55",
    documentUrl: LOISIRS_URL,
    page: 37,
    segmentId: "pdf-37-1",
    sourceText: "Nous en proposons une refonte.",
    humanDecision: "REJECT",
    editorialReason: "DEPENDENT_FRAGMENT",
    riskCategory: "SHORT_OR_FRAGMENT",
  },
  {
    id: "blind-56",
    documentUrl: LOISIRS_URL,
    page: 31,
    segmentId: "pdf-31-1",
    sourceText:
      "Selon le Crédoc, 34 % des enfants de 5 à 19 ans ne sont pas partis en vacances en 2025 : 56 % des enfants des foyers les plus pauvres ne partent jamais, contre 27 % dans les foyers les plus aisés.",
    humanDecision: "REJECT",
    editorialReason: "DIAGNOSIS",
    riskCategory: "THIRD_PARTY_OR_QUOTATION",
  },
  {
    id: "blind-57",
    documentUrl: LOISIRS_URL,
    page: 14,
    segmentId: "pdf-14-1",
    sourceText:
      "Nous refusons une République où le droit aux loisirs dépendrait du revenu, du lieu d’habitation ou du milieu social.",
    humanDecision: "REJECT",
    editorialReason: "VALUE",
    riskCategory: "DIAGNOSIS_OR_VALUE",
  },
  {
    id: "blind-58",
    documentUrl: LOISIRS_URL,
    page: 26,
    segmentId: "pdf-26-1",
    sourceText: "Proposition 2 RÉNOVER LES MAISONS DU PEUPLE ET SALLES DES FÊTES.",
    humanDecision: "ACCEPT_MEASURE",
    editorialReason: "EXPLICIT_ACTION",
    riskCategory: "TITLE_OR_SLOGAN",
  },
  {
    id: "blind-59",
    documentUrl: LOISIRS_URL,
    page: 14,
    segmentId: "pdf-14-1",
    sourceText:
      "Pour cela, il faut partir des envies et des initiatives des gens, là où ils vivent.",
    humanDecision: "REJECT",
    editorialReason: "GENERAL_INTENT",
    riskCategory: "RHETORICAL_OR_HEADING",
  },
  {
    id: "blind-60",
    documentUrl: LOISIRS_URL,
    page: 21,
    segmentId: "pdf-21-1",
    sourceText: "Séjour collectif pour les enfants.",
    humanDecision: "REJECT",
    editorialReason: "TITLE_ONLY",
    riskCategory: "TITLE_OR_SLOGAN",
  },
];
