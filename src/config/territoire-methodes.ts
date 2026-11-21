import { TERRITOIRES_SOURCES, type TerritoireSource } from "@/config/territoires-sources";
import {
  CLIMAT_STATION_MAX_KM,
  EAU_LIMIT_SENTENCE,
  EAU_MIN_ANALYSES,
  EAU_NITRATES_LIMIT_MG_L,
} from "@/config/territoire-reperes";

/**
 * Method pages of "Le territoire en chiffres" (#1052): /territoires/methode/[slug]. One per
 * `methodSlug` of an indicator, with the six headings of the kit (ReperesMethode). Texts say what
 * the figure measures and what it does not: no judgement of a territory, no link to its elected
 * officials.
 */

/** D28: the accounts are a family of their own, shown outside "Le territoire en chiffres". */
export type RepereFamille = "CHIFFRES" | "COMPTES";

/** Completes « le chiffre X … » in the page description. */
export const REPERE_FAMILLE_DU: Record<RepereFamille, string> = {
  CHIFFRES: "du territoire en chiffres",
  COMPTES: "des comptes de la collectivité",
};

/** Producer's own definition, quoted word for word, with the date it was read. */
export interface DefinitionOfficielle {
  texte: string;
  producteur: string;
  documentTitle: string;
  documentUrl: string;
  lueLe: string;
}

export interface RepereMethode {
  slug: string;
  title: string;
  famille?: RepereFamille;
  definition?: DefinitionOfficielle;
  sourceIds: readonly string[];
  montre: string;
  calcul: string;
  limites: string;
  neDitPas: string;
  historique: readonly { date: string; text: string }[];
}

const OFGL_SOURCE_IDS = [
  "ofgl-comptes-communes",
  "ofgl-comptes-departements",
  "ofgl-comptes-regions",
];

/** Read on 2026-11-21 in the OFGL dataset below, field `commentaire`, quoted without change. */
function definitionOfgl(texte: string): DefinitionOfficielle {
  return {
    texte,
    producteur: "OFGL",
    documentTitle: "Méthodologie OFGL : définitions des agrégats financiers",
    documentUrl:
      "https://data.ofgl.fr/explore/dataset/methodologie-ofgl-definitions-agregats-financiers/",
    lueLe: "2026-11-21",
  };
}

const COMPTES_CALCUL =
  "Poligraph reprend sans le modifier le montant calculé par l'OFGL à partir des balances comptables que publie la DGFiP. Ce sont des comptes consolidés : le budget principal de la collectivité et ses budgets annexes (eau, assainissement, transports…) sont additionnés, après retrait des flux entre ces budgets. Le montant par habitant est aussi celui de l'OFGL, qui divise le montant par la population totale de la collectivité pour l'exercice. Communes, départements et régions affichent le même exercice : le dernier que l'OFGL a complété pour toutes les communes.";

const COMPTES_CAS_PARTICULIERS =
  "Paris n'a qu'un compte, celui de la Ville de Paris, qui exerce les compétences d'une commune et d'un département : le même chiffre figure sur les deux pages. Les arrondissements de Paris, Lyon et Marseille n'ont pas de compte propre dans les données de l'OFGL. Pour le Bas-Rhin et le Haut-Rhin, le chiffre est celui de la Collectivité européenne d'Alsace, qui couvre les deux départements. La Corse, la Martinique et la Guyane ont chacune une collectivité unique, dont les comptes figurent sur la page de la région. Mayotte est un département qui exerce aussi les compétences d'une région : ses comptes figurent sur la page du département. Sur le territoire de la métropole de Lyon, c'est la métropole qui exerce les compétences du département, et le chiffre du Rhône ne couvre pas ce territoire.";

const COMPTES_SANS_STRATE =
  "Aucune moyenne de strate n'est affichée à côté du chiffre. L'OFGL n'en publie pas, et celle de la DGFiP porte sur le budget principal seul, avec d'autres définitions : la placer à côté d'un chiffre consolidé rapprocherait deux mesures différentes.";

const COMPTES_INTERCOMMUNALITE =
  "Une commune confie souvent une partie de ses services à son intercommunalité ou à un syndicat, qui tiennent leurs propres comptes : deux communes de même taille ne se comparent pas sur ce seul chiffre.";

const COMPTES_NE_DIT_PAS =
  "Ce montant ne dit pas si la dépense est utile ni comment le service est rendu aux habitants. Il ne se rapporte à aucun élu ni à aucun parti.";

const COMPTES_HISTORIQUE = [
  {
    date: "2026-11-21",
    text: "Première version de la méthode, publiée avant tout import de données.",
  },
] as const;

const COMPTES_METHODES: readonly RepereMethode[] = [
  {
    slug: "depenses-de-fonctionnement",
    title: "Dépenses de fonctionnement",
    famille: "COMPTES",
    definition: definitionOfgl(
      "Les dépenses de fonctionnement comprennent l'ensemble des dépenses récurrentes de la collectivité, nécessaires au fonctionnement de ses services et à la mise en œuvre de ses compétences, ainsi que les charges financières et les dépenses exceptionnelles qui ne modifient pas son patrimoine."
    ),
    sourceIds: OFGL_SOURCE_IDS,
    montre:
      "Ce que la collectivité a dépensé dans l'année pour faire fonctionner ses services : salaires, achats, subventions et aides versées, intérêts de la dette. Le chiffre est donné en euros par habitant, puis en montant total.",
    calcul: `${COMPTES_CALCUL} L'OFGL retire du total les dotations aux amortissements et aux provisions et la valeur comptable des biens cédés, des écritures qui ne correspondent pas à une dépense de l'année.`,
    limites: `${COMPTES_INTERCOMMUNALITE} ${COMPTES_CAS_PARTICULIERS} ${COMPTES_SANS_STRATE}`,
    neDitPas: COMPTES_NE_DIT_PAS,
    historique: COMPTES_HISTORIQUE,
  },
  {
    slug: "frais-de-personnel",
    title: "Frais de personnel",
    famille: "COMPTES",
    definition: definitionOfgl(
      "Les frais de personnel constituent l'un des postes des dépenses de fonctionnement. Ils correspondent au paiement du traitement des agents de la collectivité, ainsi que des charges afférentes."
    ),
    sourceIds: OFGL_SOURCE_IDS,
    montre:
      "La rémunération des agents de la collectivité et les charges qui s'y rattachent, cotisations et taxes sur les salaires comprises. C'est une partie des dépenses de fonctionnement.",
    calcul: `${COMPTES_CALCUL} Le personnel extérieur que la collectivité fait travailler pour ses services, et qu'elle rembourse à un autre organisme, est compté.`,
    limites: `Un service confié à une entreprise, à une association ou à l'intercommunalité n'apparaît pas ici : ses salariés sont payés par un autre employeur. Le chiffre ne donne pas le nombre d'agents. ${COMPTES_CAS_PARTICULIERS} ${COMPTES_SANS_STRATE}`,
    neDitPas: COMPTES_NE_DIT_PAS,
    historique: COMPTES_HISTORIQUE,
  },
  {
    slug: "depenses-d-equipement",
    title: "Dépenses d'équipement",
    famille: "COMPTES",
    definition: definitionOfgl(
      "Les dépenses d'équipement constituent un sous-poste des dépenses d'investissement hors remboursements d'emprunts. Elles correspondent aux opérations d'investissement réalisées sur le patrimoine propre de la collectivité."
    ),
    sourceIds: OFGL_SOURCE_IDS,
    montre:
      "Ce que la collectivité a investi dans l'année dans son propre patrimoine : bâtiments, voirie, réseaux, terrains, matériel, études et logiciels.",
    calcul: `${COMPTES_CALCUL} Les subventions d'équipement versées à d'autres organismes et les avances versées sur commande n'en font pas partie.`,
    limites: `Un chantier s'étale souvent sur plusieurs années, et le chiffre d'un exercice isolé peut monter ou baisser avec un seul projet. Un équipement construit par l'intercommunalité n'apparaît pas dans les comptes de la commune. ${COMPTES_CAS_PARTICULIERS} ${COMPTES_SANS_STRATE}`,
    neDitPas: COMPTES_NE_DIT_PAS,
    historique: COMPTES_HISTORIQUE,
  },
  {
    slug: "encours-de-dette",
    title: "Encours de dette",
    famille: "COMPTES",
    definition: definitionOfgl(
      "L'encours de dette correspond au stock de dette due par la collectivité au 31 décembre de l'exercice. Il inclut essentiellement les dettes bancaires et assimilées, mais également les dépôts et cautionnements reçus, ainsi que d'autres opérations assimilées à de la dette."
    ),
    sourceIds: OFGL_SOURCE_IDS,
    montre:
      "Le capital que la collectivité doit encore rembourser au 31 décembre de l'exercice. C'est un stock, accumulé au fil des années, et non une dépense de l'année.",
    calcul: `${COMPTES_CALCUL} Les intérêts courus et les primes de remboursement des obligations n'en font pas partie.`,
    limites: `Les emprunts de l'intercommunalité, et ceux des sociétés ou établissements liés à la collectivité, ne sont pas dans ce chiffre. Il ne dit pas en combien d'années la dette sera remboursée. ${COMPTES_CAS_PARTICULIERS} ${COMPTES_SANS_STRATE}`,
    neDitPas:
      "Ce montant ne dit pas à quoi l'argent emprunté a servi. Il ne se rapporte à aucun élu ni à aucun parti.",
    historique: COMPTES_HISTORIQUE,
  },
  {
    slug: "epargne-brute",
    title: "Épargne brute",
    famille: "COMPTES",
    definition: definitionOfgl(
      "L'épargne brute correspond à la différence entre les recettes et les dépenses de fonctionnement de l'année. Elle constitue l'épargne dégagée par le fonctionnement de la collectivité. Cette épargne finance prioritairement le remboursement du capital de la dette et, le cas échéant, les investissements de la collectivité."
    ),
    sourceIds: OFGL_SOURCE_IDS,
    montre:
      "Ce qui reste des recettes de fonctionnement de l'année une fois payées les dépenses de fonctionnement. Cette somme sert d'abord à rembourser le capital de la dette, puis à financer des investissements.",
    calcul: `${COMPTES_CALCUL} Le chiffre est négatif quand les dépenses de fonctionnement dépassent les recettes : il est alors affiché avec son signe.`,
    limites: `Une recette ou une dépense exceptionnelle peut suffire à le faire varier d'une année à l'autre. ${COMPTES_INTERCOMMUNALITE} ${COMPTES_CAS_PARTICULIERS} ${COMPTES_SANS_STRATE}`,
    neDitPas:
      "Ce montant ne dit pas comment la collectivité équilibre ses recettes et ses dépenses ni ce qu'elle prévoit d'en faire. Il ne se rapporte à aucun élu ni à aucun parti.",
    historique: COMPTES_HISTORIQUE,
  },
];

export const REPERE_METHODES: readonly RepereMethode[] = [
  {
    slug: "population",
    title: "Population municipale",
    sourceIds: ["insee-populations-legales"],
    montre:
      "Le nombre d'habitants d'une commune à la date de référence d'un millésime : sa population municipale, c'est-à-dire les personnes qui y ont leur résidence habituelle, sans les personnes comptées à part.",
    calcul:
      "Poligraph reprend le chiffre publié par l'INSEE sans le modifier. Pour Paris, Lyon et Marseille, celui de la commune est la somme de ses arrondissements. L'évolution compare deux populations de référence de l'INSEE et n'est affichée que si la commune a les deux, issues du même producteur.",
    limites: `Un millésime est établi à partir des enquêtes de recensement de plusieurs années : deux communes ne se comparent pas sur ce seul chiffre. Une commune dont le territoire a changé entre deux millésimes (fusion, rétablissement, changement de code) n'a pas d'évolution affichée, plutôt qu'une évolution entre deux territoires différents.`,
    neDitPas:
      "Ce chiffre ne dit rien de l'action des élus de la commune. Il ne mesure ni l'attractivité du territoire ni la qualité de vie de ses habitants.",
    historique: [{ date: "2026-10-13", text: "Première version de la méthode." }],
  },
  {
    slug: "structure-par-age",
    title: "Structure par âge",
    sourceIds: ["insee-structure-age"],
    montre:
      "La répartition des habitants en six tranches d'âge : 0 à 14 ans, 15 à 29 ans, 30 à 44 ans, 45 à 59 ans, 60 à 74 ans et 75 ans et plus, en pourcentage de la population de la commune.",
    calcul:
      "Poligraph reprend les effectifs par tranche de la base communale de l'INSEE (la tranche des 75 ans et plus est la somme des 75 à 89 ans et des 90 ans et plus) et divise chacun par le total. Un lot dont les six tranches ne totalisent pas 100 %, à 0,1 point près, n'est pas publié.",
    limites:
      "Les effectifs du recensement sont des estimations. Sur une petite commune, une tranche peut varier d'un millésime à l'autre sans que la population ait vraiment changé. Le fichier est établi dans les limites communales du 1er janvier 2025 : Poligraph ne repère pas une commune dont le territoire a changé depuis tout en gardant son code. Une tranche affichée « 0,0 % » correspond à un effectif nul ou inférieur à 0,05 % de la population : dans une très petite commune, c'est souvent une tranche vide.",
    neDitPas:
      "Une tranche d'âge n'est ni un atout ni un handicap, et cette répartition ne dit rien de l'action des élus de la commune.",
    historique: [
      { date: "2026-10-13", text: "Première version de la méthode." },
      { date: "2026-10-18", text: "Précision sur l'affichage « 0,0 % »." },
    ],
  },
  {
    slug: "eau-du-robinet",
    title: "Eau du robinet : nitrates",
    sourceIds: ["sante-eau-distribuee"],
    montre: `Pour chaque unité de distribution qui dessert la commune, le nombre d'analyses de nitrates réalisées sur douze mois dans le cadre du contrôle sanitaire des agences régionales de santé, et combien d'entre elles dépassent la limite de qualité de ${EAU_NITRATES_LIMIT_MG_L} mg/L.`,
    calcul: `Poligraph compte les analyses du fichier du ministère, validées par les agences régionales de santé, sur les douze mois qui se terminent à la date du dernier prélèvement du fichier, et non à la date du jour : le fichier est publié avec un décalage d'un à deux mois. Une valeur indiquée « inférieure à » compte comme une analyse sous la limite. Un résultat qui ne peut pas être placé face à la limite n'est pas compté. Sous ${EAU_MIN_ANALYSES} analyses, rien n'est affiché. Chaque unité est présentée séparément : Poligraph ne fait aucune moyenne entre unités.`,
    limites:
      "Une unité de distribution peut desservir une partie seulement d'une commune, ou plusieurs communes : le chiffre décrit l'unité, pas toute la commune. Les analyses sont celles du contrôle sanitaire, pas toutes les mesures faites sur le réseau. Certains prélèvements ont été faits sur une installation en amont : le ministère les rapporte à l'unité, et l'agence régionale de santé décide localement s'ils la représentent. Le fichier peut être incomplet pour les mois les plus récents, et pour les outre-mer qui y sont ajoutés progressivement. Seuls les nitrates sont repris à ce stade. Le producteur actualise régulièrement le fichier, mais Poligraph l'importe à la main : le chiffre affiché peut donc être plus ancien que la dernière analyse publiée, et la période qu'il couvre est indiquée avec chaque valeur.",
    neDitPas: `${EAU_LIMIT_SENTENCE} Ce chiffre ne dit rien des autres paramètres de l'eau, ni de l'action des élus de la commune.`,
    historique: [
      {
        date: "2026-10-14",
        text: "Première version de la méthode, nitrates seuls.",
      },
      {
        date: "2026-10-18",
        text: "Précision sur le rythme de mise à jour : import manuel, période indiquée avec chaque valeur.",
      },
    ],
  },
  {
    slug: "climat",
    title: "Climat (moyennes de la station de référence)",
    sourceIds: ["meteofrance-normales"],
    montre:
      "La température moyenne annuelle et le cumul annuel de précipitations de la station météorologique de référence de la commune, avec la période sur laquelle cette station les a mesurés : 1991-2020 pour les stations anciennes, une période plus courte pour celles ouvertes plus tard. Ce sont des moyennes sur plusieurs années, pas la météo d'une année.",
    calcul: `La station de référence est la plus proche station du même département, à moins de ${CLIMAT_STATION_MAX_KM} km du centre de la commune. Le nom de la station et la distance sont affichés avec chaque valeur. Sans station dans ce rayon, le chiffre est non établi. Poligraph ne fait aucune moyenne entre plusieurs stations. La période est lue sur la fiche de la station, grandeur par grandeur, et affichée avec chaque valeur.`,
    limites: `Une station mesure son emplacement, pas la commune : l'altitude et le relief peuvent changer le chiffre, d'où l'affichage de la distance. Deux stations voisines peuvent ne pas couvrir les mêmes années : leurs valeurs ne se comparent pas strictement entre elles, les normales officielles de Météo-France étant établies sur 1991-2020. Le seuil de ${CLIMAT_STATION_MAX_KM} km est provisoire et sera calibré sur les données réelles.`,
    neDitPas:
      "Ces moyennes ne sont pas une prévision, et elles ne disent rien de la politique menée dans la commune.",
    historique: [
      {
        date: "2026-10-13",
        text: "Première version de la méthode. Aucune donnée n'est importée tant que la licence du fichier n'est pas confirmée.",
      },
      {
        date: "2026-10-18",
        text: "Licence confirmée (Licence Ouverte 2.0, fiches climatologiques de Météo-France). Les fiches annoncent une période par grandeur, parfois plus courte que 1991-2020 : chaque valeur affiche donc la période de sa station, et le libellé « normales 1991-2020 » est retiré.",
      },
    ],
  },
  ...COMPTES_METHODES,
];

export function repereMethode(slug: string): RepereMethode | undefined {
  return REPERE_METHODES.find((m) => m.slug === slug);
}

export function methodeSources(m: RepereMethode): TerritoireSource[] {
  return m.sourceIds
    .map((id) => TERRITOIRES_SOURCES.find((s) => s.id === id))
    .filter((s): s is TerritoireSource => s !== undefined);
}

export function repereMethodePath(slug: string): string {
  return `/territoires/methode/${encodeURIComponent(slug)}`;
}
