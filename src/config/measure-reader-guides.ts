export type MeasureReaderGuideDefinition = {
  slug: string;
  label: string;
  definition: string;
  aliases: readonly string[];
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
};

/**
 * Human-reviewed starting vocabulary. Synchronisation creates DRAFT rows only: code review checks
 * the source and wording, while publication remains an explicit editorial action in the admin.
 */
export const MEASURE_READER_GUIDES: readonly MeasureReaderGuideDefinition[] = [
  {
    slug: "allocation-solidarite-specifique",
    label: "Allocation de solidarité spécifique (ASS)",
    definition:
      "L’allocation de solidarité spécifique (ASS) peut être versée aux demandeurs d’emploi qui " +
      "ont épuisé leurs droits à l’assurance chômage, si leurs ressources mensuelles ne " +
      "dépassent pas un plafond.",
    aliases: ["ASS", "allocation de solidarité spécifique"],
    sourceUrl: "https://www.service-public.gouv.fr/particuliers/vosdroits/F12484",
    sourceLabel: "Allocation de solidarité spécifique (ASS)",
    sourcePublisher: "Service Public",
  },
  {
    slug: "article-49-3",
    label: "Article 49.3 de la Constitution",
    definition:
      "L’article 49.3 de la Constitution permet au Premier ministre de faire adopter un texte " +
      "sans vote de l’Assemblée nationale, en engageant la responsabilité du Gouvernement. Le " +
      "texte est adopté sauf si une motion de censure est votée ; dans ce cas, le Gouvernement " +
      "est renversé et le texte rejeté.",
    aliases: ["article 49.3", "49.3", "article 49 alinéa 3"],
    sourceUrl:
      "https://www.vie-publique.fr/fiches/19494-le-recours-larticle-493-de-la-constitution",
    sourceLabel: "Le recours à l’article 49.3 de la Constitution",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "autorite-administrative-independante",
    label: "Autorité administrative indépendante (AAI)",
    definition:
      "Une autorité administrative indépendante agit au nom de l’État sans être placée sous " +
      "l’autorité du Gouvernement. Des garanties d’autonomie protègent l’exercice de ses " +
      "missions, souvent liées à la régulation ou à la protection des droits.",
    aliases: [
      "AAI",
      "autorité indépendante",
      "autorités indépendantes",
      "autorité administrative indépendante",
      "autorités administratives indépendantes",
    ],
    sourceUrl: "https://www.vie-publique.fr/files/rapport/pdf/194000149.pdf",
    sourceLabel: "Autorités administratives et publiques indépendantes",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "carte-scolaire",
    label: "Carte scolaire",
    definition:
      "La carte scolaire organise la répartition des élèves entre les établissements publics " +
      "selon leur lieu de résidence. L’expression désigne aussi la répartition territoriale des " +
      "classes et des moyens d’enseignement.",
    aliases: ["sectorisation scolaire", "secteur scolaire", "secteurs scolaires"],
    sourceUrl:
      "https://www.education.gouv.fr/ecole-college-lycee-l-affectation-des-eleves-et-l-attribution-des-moyens-2486",
    sourceLabel: "École, collège, lycée : l’affectation des élèves et l’attribution des moyens",
    sourcePublisher: "Ministère de l’Éducation nationale",
  },
  {
    slug: "centre-formation-apprentis",
    label: "Centre de formation d’apprentis (CFA)",
    definition:
      "Un centre de formation d’apprentis assure la partie théorique d’une formation en " +
      "apprentissage. L’apprenti alterne cette formation avec une activité pratique chez un " +
      "employeur.",
    aliases: [
      "CFA",
      "centre de formation d'apprentis",
      "centres de formation d'apprentis",
      "centre de formation des apprentis",
      "centres de formation des apprentis",
    ],
    sourceUrl: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2918",
    sourceLabel: "Contrat d’apprentissage",
    sourcePublisher: "Service Public",
  },
  {
    slug: "charge-preuve",
    label: "Charge de la preuve",
    definition:
      "La charge de la preuve détermine à qui il revient d’établir un fait devant la justice. En " +
      "matière civile, celui qui réclame l’exécution d’une obligation doit en apporter la preuve, " +
      "et celui qui affirme en être libéré doit le justifier.",
    aliases: ["charge de preuve", "renversement de la charge de la preuve"],
    sourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042341",
    sourceLabel: "Article 1353 du Code civil",
    sourcePublisher: "Légifrance",
  },
  {
    slug: "compte-professionnel-prevention",
    label: "Compte professionnel de prévention (C2P)",
    definition:
      "Le compte professionnel de prévention (C2P) vise à réduire les effets de l’exposition " +
      "des salariés à certains risques professionnels. Il leur permet de se former ou d’engager " +
      "une reconversion pour accéder à un emploi moins exposé ou non exposé.",
    aliases: ["C2P", "compte professionnel de prévention"],
    sourceUrl: "https://www.service-public.gouv.fr/particuliers/vosdroits/F15504",
    sourceLabel: "Compte professionnel de prévention (C2P)",
    sourcePublisher: "Service Public",
  },
  {
    slug: "conflit-interets",
    label: "Conflit d’intérêts",
    definition:
      "Un conflit d’intérêts est une situation dans laquelle un intérêt public interfère avec " +
      "d’autres intérêts et peut influencer, ou sembler influencer, l’exercice indépendant, " +
      "impartial et objectif d’une fonction.",
    aliases: ["conflits d'intérêts", "prévention des conflits d'intérêts"],
    sourceUrl:
      "https://www.hatvp.fr/la-haute-autorite/la-deontologie-des-responsables-publics/prevention-des-conflits-dinterets/",
    sourceLabel: "La prévention des conflits d’intérêts",
    sourcePublisher: "Haute Autorité pour la transparence de la vie publique",
  },
  {
    slug: "convention-judiciaire-interet-public",
    label: "Convention judiciaire d’intérêt public (CJIP)",
    definition:
      "Une convention judiciaire d’intérêt public permet au procureur de proposer à une personne " +
      "morale des obligations, comme une amende ou un programme de conformité, sans engager un " +
      "procès pénal. Son exécution éteint l’action publique sans déclaration de culpabilité.",
    aliases: [
      "CJIP",
      "convention judiciaire d'intérêt public",
      "conventions judiciaires d'intérêt public",
    ],
    sourceUrl:
      "https://www.justice.gouv.fr/sites/default/files/2025-05/rapport_mission_urgence_dejudiciarisation_annexes.pdf",
    sourceLabel: "Rapport de la mission d’urgence relative à la déjudiciarisation",
    sourcePublisher: "Ministère de la Justice",
  },
  {
    slug: "cotisations-sociales",
    label: "Cotisations sociales",
    definition:
      "Les cotisations et contributions sociales financent la protection sociale, notamment la " +
      "santé, la retraite, la famille et l’assurance chômage. Elles sont prélevées principalement " +
      "sur les revenus d’activité puis redistribuées aux organismes concernés.",
    aliases: [
      "cotisation sociale",
      "cotisations patronales",
      "cotisations salariales",
      "charges sociales",
    ],
    sourceUrl: "https://www.urssaf.fr/accueil/a-quoi-servent-les-cotisations.html",
    sourceLabel: "À quoi servent les cotisations ?",
    sourcePublisher: "Urssaf",
  },
  {
    slug: "cour-justice-republique",
    label: "Cour de justice de la République (CJR)",
    definition:
      "La Cour de justice de la République juge les membres du Gouvernement pour les crimes ou " +
      "délits commis dans l’exercice de leurs fonctions. Elle réunit des parlementaires et des " +
      "magistrats de la Cour de cassation.",
    aliases: ["CJR", "Cour de justice de la République"],
    sourceUrl:
      "https://www.assemblee-nationale.fr/dyn/17/organes/cjr/cour-de-justice-de-la-republique",
    sourceLabel: "Cour de justice de la République",
    sourcePublisher: "Assemblée nationale",
  },
  {
    slug: "defenseur-droits",
    label: "Défenseur des droits",
    definition:
      "Le Défenseur des droits est une autorité administrative indépendante chargée de défendre " +
      "les personnes dont les droits ne sont pas respectés et de promouvoir l’égalité. Il peut " +
      "être saisi gratuitement dans les domaines relevant de ses missions.",
    aliases: ["Défenseure des droits", "DDD"],
    sourceUrl: "https://www.defenseurdesdroits.fr/decouvrir-le-defenseur-des-droits-197",
    sourceLabel: "Découvrir le Défenseur des droits",
    sourcePublisher: "Défenseur des droits",
  },
  {
    slug: "diagnostic-performance-energetique",
    label: "Diagnostic de performance énergétique (DPE)",
    definition:
      "Le diagnostic de performance énergétique (DPE) informe sur la performance énergétique et " +
      "climatique d’un logement ou d’un bâtiment. Le propriétaire qui vend ou loue doit le " +
      "faire réaliser pour informer l’acquéreur ou le locataire des charges énergétiques et lui " +
      "recommander des travaux.",
    aliases: ["DPE", "diagnostic de performance énergétique"],
    sourceUrl: "https://www.service-public.gouv.fr/particuliers/vosdroits/F16096",
    sourceLabel: "Diagnostic immobilier : diagnostic de performance énergétique (DPE)",
    sourcePublisher: "Service Public",
  },
  {
    slug: "dossier-medical-partage",
    label: "Dossier médical partagé (DMP)",
    definition:
      "Le dossier médical partagé est un carnet de santé numérique qui rassemble des informations " +
      "utiles aux soins. Il permet au patient et aux professionnels autorisés de partager ces " +
      "informations dans Mon espace santé.",
    aliases: ["DMP", "dossier médical partagé", "dossiers médicaux partagés"],
    sourceUrl:
      "https://www.ameli.fr/medecin/sante-prevention/dmp-et-mon-espace-sante/dmp-en-pratique",
    sourceLabel: "Le DMP en pratique",
    sourcePublisher: "Assurance Maladie",
  },
  {
    slug: "education-prioritaire",
    label: "Éducation prioritaire (REP, REP+)",
    definition:
      "L’éducation prioritaire renforce l’action pédagogique et éducative dans les écoles et " +
      "établissements des territoires aux plus grandes difficultés sociales, pour corriger " +
      "l’effet des inégalités sociales et économiques sur la réussite scolaire. Les réseaux " +
      "REP+ couvrent les secteurs où ces difficultés sont les plus concentrées, les REP des " +
      "secteurs plus mixtes.",
    aliases: [
      "éducation prioritaire",
      "réseau d'éducation prioritaire",
      "réseaux d'éducation prioritaire",
      "REP",
      "REP+",
    ],
    sourceUrl: "https://www.education.gouv.fr/l-education-prioritaire-3140",
    sourceLabel: "L’éducation prioritaire",
    sourcePublisher: "Ministère de l’Éducation nationale",
  },
  {
    slug: "fonction-publique",
    label: "Fonction publique",
    definition:
      "La fonction publique comprend trois versants : la fonction publique de l’État, la " +
      "fonction publique territoriale, qui regroupe les fonctionnaires des régions, " +
      "départements, communes et de leurs établissements publics, et la fonction publique " +
      "hospitalière.",
    aliases: ["trois versants de la fonction publique"],
    sourceUrl:
      "https://www.vie-publique.fr/fiches/20256-existe-t-il-differentes-categories-de-fonctionnaires",
    sourceLabel: "Existe-t-il différentes catégories de fonctionnaires ?",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "impots-production",
    label: "Impôts de production",
    definition:
      "Les impôts de production sont les impôts que les entreprises supportent du fait de leur " +
      "activité de production, quels que soient la quantité ou la valeur des biens et services " +
      "produits ou vendus. L’Insee les classe parmi les « autres impôts sur la production ».",
    aliases: ["impôt de production", "impôts sur la production"],
    sourceUrl: "https://www.insee.fr/fr/metadonnees/definition/c1541",
    sourceLabel: "Autres impôts sur la production (D29)",
    sourcePublisher: "Insee",
  },
  {
    slug: "instructions-individuelles",
    label: "Instructions individuelles",
    definition:
      "Une instruction individuelle est une consigne donnée par le ministre de la Justice au " +
      "parquet dans une affaire particulière. Depuis une loi du 25 juillet 2013, le ministre ne " +
      "peut plus en adresser : les magistrats du parquet ne reçoivent que des instructions " +
      "générales de politique pénale.",
    aliases: ["instruction individuelle", "instructions dans les affaires individuelles"],
    sourceUrl:
      "https://www.vie-publique.fr/fiches/38127-quest-ce-que-le-parquet-ou-ministere-public",
    sourceLabel: "Qu’est-ce que le parquet (ou ministère public) ?",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "kafala-judiciaire",
    label: "Kafala judiciaire",
    definition:
      "La kafala est une mesure de recueil légal d’un enfant prévue dans plusieurs pays de droit " +
      "musulman. En France, elle produit selon les situations des effets comparables à une tutelle " +
      "ou à une délégation d’autorité parentale, sans créer de lien de filiation comme l’adoption.",
    aliases: ["kafala", "recueil par kafala", "recueil juridique par kafala"],
    sourceUrl:
      "https://www.diplomatie.gouv.fr/fr/services-aux-francaises-et-aux-francais/adoption-a-l-etranger/glossaire-de-l-adoption",
    sourceLabel: "Glossaire de l’adoption",
    sourcePublisher: "Ministère de l’Europe et des Affaires étrangères",
  },
  {
    slug: "marches-publics",
    label: "Marché public",
    definition:
      "Un marché public est un contrat conclu contre paiement entre un acheteur public et un " +
      "opérateur économique pour répondre à un besoin en travaux, fournitures ou services. Sa " +
      "passation obéit aux règles de la commande publique.",
    aliases: ["marchés publics"],
    sourceUrl:
      "https://www.economie.gouv.fr/files/files/directions_services/daj/marches_publics/conseil_acheteurs/fiches-techniques/champs-application/contrats-cp-et-autres-contrats-2019.pdf",
    sourceLabel: "Les contrats de la commande publique et autres contrats",
    sourcePublisher: "Direction des affaires juridiques",
  },
  {
    slug: "pantouflage",
    label: "Pantouflage",
    definition:
      "Le pantouflage désigne le départ d’un agent public vers le secteur privé. Le " +
      "rétro-pantouflage désigne le mouvement inverse, quand une personne ayant travaillé dans " +
      "le privé rejoint ou réintègre l’administration. Depuis la loi du 6 août 2019, ces deux " +
      "mouvements font l’objet d’un contrôle déontologique.",
    aliases: ["rétro-pantouflage"],
    sourceUrl:
      "https://www.vie-publique.fr/eclairage/271991-deontologie-des-fonctionnaires-ce-que-change-la-loi-du-6-aout-2019",
    sourceLabel: "Déontologie des fonctionnaires : ce que change la loi du 6 août 2019",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "parquet",
    label: "Parquet (ministère public)",
    definition:
      "Le parquet, ou ministère public, réunit les magistrats chargés de requérir l’application " +
      "de la loi et de conduire l’action pénale au nom des intérêts de la société. Ils ne " +
      "rendent pas de jugement et sont placés sous l’autorité du ministre de la Justice.",
    aliases: ["parquet", "ministère public"],
    sourceUrl:
      "https://www.vie-publique.fr/fiches/38127-quest-ce-que-le-parquet-ou-ministere-public",
    sourceLabel: "Qu’est-ce que le parquet (ou ministère public) ?",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "peines-planchers",
    label: "Peines planchers",
    definition:
      "Les peines planchers étaient des peines minimales que le juge devait prononcer pour " +
      "certaines infractions commises en récidive, sauf décision particulièrement motivée. " +
      "Instaurées par une loi du 10 août 2007, elles ont été supprimées par la loi du 15 août " +
      "2014.",
    aliases: ["peine plancher"],
    sourceUrl:
      "https://www.vie-publique.fr/questions-reponses/296120-les-peines-en-droit-penal-le-point-en-cinq-questions",
    sourceLabel: "Les peines en droit pénal. Le point en cinq questions",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "politique-agricole-commune",
    label: "Politique agricole commune (PAC)",
    definition:
      "La politique agricole commune est la politique de l’Union européenne consacrée à " +
      "l’agriculture. Elle organise notamment des aides aux agriculteurs et des mesures de soutien " +
      "aux marchés, aux territoires ruraux et aux transitions agricoles.",
    aliases: ["PAC", "politique agricole commune"],
    sourceUrl: "https://agriculture.gouv.fr/pac-politique-agricole-commune",
    sourceLabel: "PAC : politique agricole commune",
    sourcePublisher: "Ministère de l’Agriculture",
  },
  {
    slug: "programmation-pluriannuelle-energie",
    label: "Programmation pluriannuelle de l’énergie (PPE)",
    definition:
      "La programmation pluriannuelle de l’énergie (PPE) est l’outil de pilotage de la " +
      "politique énergétique créé par la loi relative à la transition énergétique pour la " +
      "croissance verte. La troisième, dite PPE3, publiée le 13 février 2026, fixe la stratégie " +
      "énergétique de la France pour 2026-2035.",
    aliases: [
      "PPE",
      "PPE3",
      "programmation pluriannuelle de l'énergie",
      "programmations pluriannuelles de l'énergie",
    ],
    sourceUrl:
      "https://www.ecologie.gouv.fr/politiques-publiques/programmations-pluriannuelles-lenergie-ppe",
    sourceLabel: "Programmations pluriannuelles de l’énergie (PPE)",
    sourcePublisher: "Ministère de la Transition écologique",
  },
  {
    slug: "referendum",
    label: "Référendum",
    definition:
      "Un référendum est une consultation directe des citoyens sur une question ou un texte. Les " +
      "électeurs répondent par leur vote et exercent ainsi une forme directe de souveraineté.",
    aliases: ["référendums", "consultation référendaire", "voie référendaire"],
    sourceUrl:
      "https://www.vie-publique.fr/questions-reponses/290760-le-referendum-en-france-en-sept-questions",
    sourceLabel: "Le référendum en France en sept questions",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "representant-interets",
    label: "Représentant d’intérêts (lobbying)",
    definition:
      "Le lobbying, ou représentation d’intérêts, consiste à prendre l’initiative d’entrer en " +
      "contact avec des responsables publics pour influencer leurs décisions. Les représentants " +
      "d’intérêts peuvent être des entreprises, des sociétés de conseil, des syndicats, des " +
      "associations ou des ONG.",
    aliases: [
      "lobbying",
      "lobby",
      "lobbies",
      "représentation d'intérêts",
      "représentant d'intérêts",
      "représentants d'intérêts",
      "registre des représentants d'intérêts",
    ],
    sourceUrl: "https://www.hatvp.fr/lobbying/",
    sourceLabel: "Le lobbying",
    sourcePublisher: "Haute Autorité pour la transparence de la vie publique",
  },
  {
    slug: "salaire-minimum-croissance",
    label: "Salaire minimum interprofessionnel de croissance (SMIC)",
    definition:
      "Le salaire minimum interprofessionnel de croissance est le salaire horaire minimum légal " +
      "applicable aux salariés majeurs. Son montant est revalorisé selon des règles prévues par le " +
      "Code du travail.",
    aliases: ["SMIC", "salaire minimum", "salaire minimum de croissance"],
    sourceUrl: "https://www.vie-publique.fr/files/medias/L_essentiel_Numero_4_Le_SMIC.pdf",
    sourceLabel: "L’essentiel sur le SMIC",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "scrutin-proportionnel",
    label: "Scrutin proportionnel",
    definition:
      "Au scrutin proportionnel, les sièges sont répartis entre des listes de candidats selon " +
      "le nombre de voix obtenues. Les députés sont aujourd’hui élus au scrutin majoritaire " +
      "uninominal à deux tours.",
    aliases: ["proportionnelle", "proportionnelle intégrale", "représentation proportionnelle"],
    sourceUrl:
      "https://www.vie-publique.fr/fiches/23948-quels-sont-les-differents-modes-de-scrutin",
    sourceLabel: "Quels sont les différents modes de scrutin ?",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "sous-traitance",
    label: "Sous-traitance",
    definition:
      "La sous-traitance est l’opération par laquelle une entreprise confie à une autre, le " +
      "sous-traitant, l’exécution de tout ou partie d’un contrat ou d’un marché public qu’elle " +
      "a conclu, en restant responsable de cette exécution.",
    aliases: ["sous-traitant", "sous-traitants"],
    sourceUrl: "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000023053343",
    sourceLabel: "Loi n° 75-1334 du 31 décembre 1975 relative à la sous-traitance, article 1er",
    sourcePublisher: "Légifrance",
  },
  {
    slug: "tarification-activite",
    label: "Tarification à l’activité (T2A)",
    definition:
      "La tarification à l’activité (T2A) est une méthode de financement des établissements de " +
      "santé mise en place en 2004. Les ressources allouées à chaque établissement dépendent de " +
      "la mesure de son activité effective.",
    aliases: ["T2A", "tarification à l'activité"],
    sourceUrl:
      "https://www.vie-publique.fr/fiches/37927-financement-des-soins-lhopital-la-tarification-lactivite-t2a",
    sourceLabel: "Financement des soins à l’hôpital : la tarification à l’activité (T2A)",
    sourcePublisher: "Vie publique",
  },
  {
    slug: "zero-artificialisation-nette",
    label: "Zéro artificialisation nette (ZAN)",
    definition:
      "Le zéro artificialisation nette (ZAN) est l’objectif fixé pour 2050 par la loi Climat et " +
      "résilience d’août 2021. Il prévoit une étape intermédiaire : réduire de moitié la " +
      "consommation d’espaces naturels, agricoles et forestiers sur 2021-2031 par rapport à " +
      "2011-2021.",
    aliases: ["ZAN", "zéro artificialisation nette", "objectif ZAN"],
    sourceUrl: "https://www.ecologie.gouv.fr/politiques-publiques/artificialisation-sols",
    sourceLabel: "Artificialisation des sols",
    sourcePublisher: "Ministère de la Transition écologique",
  },
  {
    slug: "zones-faibles-emissions",
    label: "Zone à faibles émissions (ZFE)",
    definition:
      "Une zone à faibles émissions est un périmètre routier où la circulation des véhicules " +
      "les plus polluants est restreinte selon des règles fixées localement. Le dispositif vise " +
      "à améliorer la qualité de l’air.",
    aliases: [
      "ZFE",
      "ZFE-m",
      "zone à faibles émissions",
      "zones à faibles émissions",
      "zone à faibles émissions mobilité",
      "zones à faibles émissions mobilité",
    ],
    sourceUrl: "https://www.ecologie.gouv.fr/politiques-publiques/zones-faibles-emissions-zfe",
    sourceLabel: "Zones à faibles émissions (ZFE)",
    sourcePublisher: "Ministère de la Transition écologique",
  },
];
