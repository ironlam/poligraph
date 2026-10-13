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

export interface RepereMethode {
  slug: string;
  title: string;
  sourceIds: readonly string[];
  montre: string;
  calcul: string;
  limites: string;
  neDitPas: string;
  historique: readonly { date: string; text: string }[];
}

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
      "Les effectifs du recensement sont des estimations. Sur une petite commune, une tranche peut varier d'un millésime à l'autre sans que la population ait vraiment changé. Le fichier est établi dans les limites communales du 1er janvier 2025 : Poligraph ne repère pas une commune dont le territoire a changé depuis tout en gardant son code.",
    neDitPas:
      "Une tranche d'âge n'est ni un atout ni un handicap, et cette répartition ne dit rien de l'action des élus de la commune.",
    historique: [{ date: "2026-10-13", text: "Première version de la méthode." }],
  },
  {
    slug: "eau-du-robinet",
    title: "Eau du robinet : nitrates",
    sourceIds: ["sante-eau-distribuee"],
    montre: `Pour chaque unité de distribution qui dessert la commune, le nombre d'analyses de nitrates réalisées sur douze mois dans le cadre du contrôle sanitaire des agences régionales de santé, et combien d'entre elles dépassent la limite de qualité de ${EAU_NITRATES_LIMIT_MG_L} mg/L.`,
    calcul: `Poligraph compte les analyses du fichier du ministère, validées par les agences régionales de santé, sur les douze mois qui se terminent à la date du dernier prélèvement du fichier, et non à la date du jour : le fichier est publié avec un décalage d'un à deux mois. Une valeur indiquée « inférieure à » compte comme une analyse sous la limite. Un résultat qui ne peut pas être placé face à la limite n'est pas compté. Sous ${EAU_MIN_ANALYSES} analyses, rien n'est affiché. Chaque unité est présentée séparément : Poligraph ne fait aucune moyenne entre unités.`,
    limites:
      "Une unité de distribution peut desservir une partie seulement d'une commune, ou plusieurs communes : le chiffre décrit l'unité, pas toute la commune. Les analyses sont celles du contrôle sanitaire, pas toutes les mesures faites sur le réseau. Le fichier peut être incomplet pour les mois les plus récents, et pour les outre-mer qui y sont ajoutés progressivement. Seuls les nitrates sont repris à ce stade.",
    neDitPas: `${EAU_LIMIT_SENTENCE} Ce chiffre ne dit rien des autres paramètres de l'eau, ni de l'action des élus de la commune.`,
    historique: [
      {
        date: "2026-10-14",
        text: "Première version de la méthode, nitrates seuls.",
      },
    ],
  },
  {
    slug: "climat",
    title: "Climat (normales 1991-2020)",
    sourceIds: ["meteofrance-normales"],
    montre:
      "Les normales 1991-2020 de la station météorologique de référence de la commune : température moyenne annuelle et cumul annuel de précipitations. Ce sont des moyennes sur trente ans, pas la météo d'une année.",
    calcul: `La station de référence est la plus proche station du même département, à moins de ${CLIMAT_STATION_MAX_KM} km du centre de la commune. Le nom de la station et la distance sont affichés avec chaque valeur. Sans station dans ce rayon, le chiffre est non établi. Poligraph ne fait aucune moyenne entre plusieurs stations.`,
    limites: `Une station mesure son emplacement, pas la commune : l'altitude et le relief peuvent changer le chiffre, d'où l'affichage de la distance. Le seuil de ${CLIMAT_STATION_MAX_KM} km est provisoire et sera calibré sur les données réelles.`,
    neDitPas:
      "Ces normales ne sont pas une prévision, et elles ne disent rien de la politique menée dans la commune.",
    historique: [
      {
        date: "2026-10-13",
        text: "Première version de la méthode. Aucune donnée n'est importée tant que la licence du fichier n'est pas confirmée.",
      },
    ],
  },
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
