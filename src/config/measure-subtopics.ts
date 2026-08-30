import type { ThemeCategory } from "@/generated/prisma";

export const MEASURE_SUBTOPIC_TAXONOMY_VERSION = "2026-08-30-v4";

export type MeasureSubtopicDefinition = {
  slug: string;
  label: string;
  description: string;
  theme: ThemeCategory;
  aliases: string[];
  classifierGuidance?: string;
  sortOrder: number;
};

function topic(
  theme: ThemeCategory,
  sortOrder: number,
  slug: string,
  label: string,
  description: string,
  aliases: string[] = [],
  classifierGuidance?: string
): MeasureSubtopicDefinition {
  return { theme, sortOrder, slug, label, description, aliases, classifierGuidance };
}

/**
 * Initial closed vocabulary for programme navigation.
 *
 * These labels describe policy objects, never political camps, audiences or value judgments. A
 * measure can receive up to three entries, but only inside its already validated broad theme.
 */
export const MEASURE_SUBTOPICS: readonly MeasureSubtopicDefinition[] = [
  topic("ECONOMIE_BUDGET", 10, "fiscalite", "Fiscalité", "Impôts, taxes et prélèvements.", [
    "impôts",
    "taxes",
  ]),
  topic(
    "ECONOMIE_BUDGET",
    20,
    "finances-publiques",
    "Finances publiques",
    "Budget, dette et dépenses publiques."
  ),
  topic(
    "ECONOMIE_BUDGET",
    30,
    "entreprises-industrie",
    "Entreprises et industrie",
    "Entreprises, industrie, commerce et production."
  ),
  topic(
    "ECONOMIE_BUDGET",
    40,
    "pouvoir-achat",
    "Pouvoir d’achat",
    "Prix, consommation et pouvoir d’achat."
  ),

  topic(
    "EMPLOI_TRAVAIL",
    10,
    "emploi-travail",
    "Emploi et travail",
    "Emploi, contrats, temps et conditions de travail."
  ),
  topic(
    "EMPLOI_TRAVAIL",
    20,
    "salaires",
    "Salaires",
    "Rémunérations, salaire minimum et partage de la valeur."
  ),
  topic(
    "EMPLOI_TRAVAIL",
    30,
    "dialogue-social",
    "Dialogue social",
    "Syndicats, représentation des salariés et négociation collective."
  ),
  topic(
    "EMPLOI_TRAVAIL",
    40,
    "formation-professionnelle",
    "Formation professionnelle",
    "Apprentissage, reconversion et formation tout au long de la vie."
  ),
  topic("RETRAITES", 10, "retraites", "Retraites", "Âge, cotisations et pensions de retraite."),
  topic(
    "SOLIDARITES_PROTECTION_SOCIALE",
    10,
    "protection-sociale",
    "Protection sociale",
    "Prestations, minima sociaux et sécurité sociale."
  ),
  topic(
    "SOLIDARITES_PROTECTION_SOCIALE",
    20,
    "handicap-autonomie",
    "Handicap et autonomie",
    "Handicap, dépendance, accessibilité et accompagnement de l’autonomie."
  ),
  topic(
    "SOLIDARITES_PROTECTION_SOCIALE",
    30,
    "pauvrete-precarite",
    "Pauvreté et précarité",
    "Lutte contre la pauvreté, exclusion et accès aux droits sociaux."
  ),

  topic(
    "SECURITE_JUSTICE",
    10,
    "police-securite",
    "Police et sécurité",
    "Forces de sécurité et protection des personnes."
  ),
  topic(
    "SECURITE_JUSTICE",
    20,
    "justice",
    "Justice",
    "Organisation judiciaire, procédures et accès au droit."
  ),
  topic(
    "SECURITE_JUSTICE",
    30,
    "prisons",
    "Prisons",
    "Politique pénitentiaire et conditions de détention."
  ),
  topic(
    "SOCIETE_DROITS_LIBERTES",
    10,
    "egalite-discriminations",
    "Égalité et discriminations",
    "Égalité devant la loi et lutte contre les discriminations.",
    [],
    "Utiliser pour les discriminations génériques ou fondées sur un critère autre que l’origine ou l’appartenance réelle ou supposée. Peut être associé à racisme-antisemitisme quand les deux périmètres sont explicitement traités."
  ),
  topic(
    "SOCIETE_DROITS_LIBERTES",
    20,
    "racisme-antisemitisme",
    "Racisme et antisémitisme",
    "Prévention et lutte contre le racisme, l’antisémitisme, la xénophobie et les discriminations fondées sur l’origine ou l’appartenance réelle ou supposée.",
    ["racisme", "raciste", "antisémitisme", "antisémite", "xénophobie", "discriminations raciales"],
    "Utiliser pour l’origine, la couleur de peau, l’appartenance ethnique ou religieuse réelle ou supposée, le racisme, l’antisémitisme ou la xénophobie. Le thème parent unique est une limite de la taxonomie actuelle, ce sous-thème n’est pas encore une facette transversale."
  ),
  topic(
    "SOCIETE_DROITS_LIBERTES",
    30,
    "droits-des-femmes",
    "Droits des femmes",
    "Égalité entre les femmes et les hommes et droits reproductifs."
  ),
  topic(
    "SOCIETE_DROITS_LIBERTES",
    40,
    "famille-bioethique",
    "Famille et bioéthique",
    "Droit de la famille, filiation, bioéthique et fin de vie."
  ),
  topic(
    "SOCIETE_DROITS_LIBERTES",
    50,
    "libertes-publiques-societe",
    "Libertés publiques",
    "Libertés d’expression, d’association, de manifestation et de conscience."
  ),

  topic(
    "ENVIRONNEMENT_ENERGIE",
    10,
    "climat",
    "Climat",
    "Réduction des émissions et adaptation climatique."
  ),
  topic(
    "ENVIRONNEMENT_ENERGIE",
    20,
    "energie",
    "Énergie",
    "Production, sobriété et prix de l’énergie."
  ),
  topic(
    "ENVIRONNEMENT_ENERGIE",
    30,
    "biodiversite",
    "Biodiversité",
    "Espèces, espaces naturels et écosystèmes."
  ),
  topic(
    "ENVIRONNEMENT_ENERGIE",
    40,
    "pollutions-dechets",
    "Pollutions et déchets",
    "Déchets, qualité de l’air, sols et pollutions."
  ),

  topic(
    "SANTE",
    10,
    "acces-aux-soins",
    "Accès aux soins",
    "Déserts médicaux, professionnels et prise en charge."
  ),
  topic("SANTE", 20, "hopital", "Hôpital", "Hôpital public, urgences, capacités et personnels."),
  topic("SANTE", 30, "prevention-sante", "Prévention", "Prévention, dépistage et santé publique."),
  topic(
    "SANTE",
    40,
    "sante-mentale",
    "Santé mentale",
    "Psychiatrie, santé mentale et accompagnement psychologique."
  ),

  topic(
    "EDUCATION_CULTURE",
    10,
    "ecole",
    "École",
    "Enseignement primaire et secondaire, personnels et élèves."
  ),
  topic(
    "EDUCATION_CULTURE",
    20,
    "enseignement-superieur-recherche",
    "Enseignement supérieur et recherche",
    "Universités, étudiants et recherche publique."
  ),
  topic(
    "EDUCATION_CULTURE",
    30,
    "culture-medias",
    "Culture et médias",
    "Création, patrimoine, médias et audiovisuel."
  ),
  topic(
    "EDUCATION_CULTURE",
    40,
    "jeunesse-sport",
    "Jeunesse et sport",
    "Jeunesse, vie associative et pratiques sportives."
  ),

  topic(
    "INSTITUTIONS",
    10,
    "constitution",
    "Constitution",
    "Constitution, pouvoirs publics et équilibre institutionnel."
  ),
  topic(
    "INSTITUTIONS",
    20,
    "democratie-elections",
    "Démocratie et élections",
    "Scrutins, participation et représentation politique."
  ),
  topic(
    "INSTITUTIONS",
    30,
    "collectivites-territoires",
    "Collectivités et territoires",
    "Décentralisation et compétences territoriales."
  ),
  topic(
    "INSTITUTIONS",
    40,
    "services-publics",
    "Services publics",
    "Organisation, accès et moyens des services publics."
  ),

  topic(
    "AFFAIRES_ETRANGERES_DEFENSE",
    10,
    "union-europeenne",
    "Union européenne",
    "Institutions, politiques et droit de l’Union européenne."
  ),
  topic(
    "AFFAIRES_ETRANGERES_DEFENSE",
    20,
    "diplomatie",
    "Diplomatie",
    "Relations internationales, traités et diplomatie."
  ),
  topic(
    "AFFAIRES_ETRANGERES_DEFENSE",
    30,
    "defense",
    "Défense",
    "Armées, doctrine, équipements et service national."
  ),
  topic(
    "AFFAIRES_ETRANGERES_DEFENSE",
    40,
    "cooperation-developpement",
    "Coopération et développement",
    "Aide au développement et coopération internationale."
  ),

  topic(
    "NUMERIQUE_TECH",
    10,
    "innovation-ia",
    "Innovation et IA",
    "Innovation technologique et intelligence artificielle."
  ),
  topic(
    "NUMERIQUE_TECH",
    20,
    "donnees-vie-privee",
    "Données et vie privée",
    "Données personnelles, surveillance et vie privée."
  ),
  topic(
    "NUMERIQUE_TECH",
    30,
    "plateformes-numeriques",
    "Plateformes numériques",
    "Régulation des plateformes et des services en ligne."
  ),
  topic(
    "NUMERIQUE_TECH",
    40,
    "cybersecurite",
    "Cybersécurité",
    "Sécurité informatique et résilience numérique."
  ),

  topic("IMMIGRATION", 10, "asile", "Asile", "Droit d’asile et accueil des demandeurs."),
  topic(
    "IMMIGRATION",
    20,
    "sejour-eloignement",
    "Séjour et éloignement",
    "Titres de séjour, régularisation et éloignement."
  ),
  topic(
    "IMMIGRATION",
    30,
    "frontieres",
    "Frontières",
    "Contrôle des frontières et politique des visas."
  ),
  topic(
    "IMMIGRATION",
    40,
    "integration-nationalite",
    "Intégration et nationalité",
    "Intégration, naturalisation et accès à la nationalité."
  ),

  topic(
    "AGRICULTURE_ALIMENTATION",
    10,
    "agriculture",
    "Agriculture",
    "Exploitations, revenus agricoles et modèles de production."
  ),
  topic(
    "AGRICULTURE_ALIMENTATION",
    20,
    "alimentation",
    "Alimentation",
    "Qualité, prix, sécurité et accès à l’alimentation."
  ),
  topic(
    "AGRICULTURE_ALIMENTATION",
    30,
    "peche",
    "Pêche",
    "Filières de pêche et ressources marines."
  ),
  topic(
    "AGRICULTURE_ALIMENTATION",
    40,
    "ruralite",
    "Ruralité",
    "Services, économie et aménagement des territoires ruraux."
  ),

  topic(
    "LOGEMENT_URBANISME",
    10,
    "acces-au-logement",
    "Accès au logement",
    "Accès, aides, hébergement et lutte contre le sans-abrisme."
  ),
  topic(
    "LOGEMENT_URBANISME",
    20,
    "loyers",
    "Loyers",
    "Niveau, encadrement et évolution des loyers."
  ),
  topic(
    "LOGEMENT_URBANISME",
    30,
    "logement-social",
    "Logement social",
    "Construction, attribution et gestion du parc social."
  ),
  topic(
    "LOGEMENT_URBANISME",
    40,
    "construction-renovation",
    "Construction et rénovation",
    "Construction, rénovation énergétique et qualité de l’habitat."
  ),

  topic(
    "TRANSPORTS",
    10,
    "ferroviaire",
    "Ferroviaire",
    "Trains, réseau ferré, gares et fret ferroviaire."
  ),
  topic(
    "TRANSPORTS",
    20,
    "routes-automobile",
    "Routes et automobile",
    "Routes, véhicules, circulation et sécurité routière."
  ),
  topic(
    "TRANSPORTS",
    30,
    "transports-collectifs",
    "Transports collectifs",
    "Bus, métros, tramways et tarification collective."
  ),
  topic(
    "TRANSPORTS",
    40,
    "aerien-maritime",
    "Aérien et maritime",
    "Aviation, ports, navigation et transport maritime."
  ),
];

export function getMeasureSubtopicsForTheme(
  theme: ThemeCategory
): readonly MeasureSubtopicDefinition[] {
  return MEASURE_SUBTOPICS.filter((subtopic) => subtopic.theme === theme);
}
