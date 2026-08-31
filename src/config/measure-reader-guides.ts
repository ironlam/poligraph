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
