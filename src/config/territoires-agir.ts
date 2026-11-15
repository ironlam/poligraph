/**
 * Fixed text of the « Agir » block of a commune page: what an inhabitant may do, said in one
 * sentence per way, each with its official source. Written by hand and read against the sources
 * on the date below, without review by a lawyer.
 *
 * Rule of the block: it points to the source rather than copying it. No deadline, threshold or
 * amount is written here (they change, and a wrong one would mislead): the reader finds them on
 * the official page, which is kept up to date. A test refuses figures in these lines.
 */

import { TERRITOIRES_SANS_COMMUNE } from "@/config/regions";

export interface AgirLien {
  label: string;
  url: string;
}

export interface AgirVoie {
  id: string;
  titre: string;
  texte: string;
  liens: AgirLien[];
}

const SERVICE_PUBLIC = "https://www.service-public.gouv.fr/particuliers/vosdroits";
const LEGIFRANCE = "https://www.legifrance.gouv.fr/codes/article_lc";

/** Day the lines and links below were checked against their sources. */
export const AGIR_VERIFIE_LE = "2026-11-15";

export const AGIR_AVERTISSEMENT =
  "Information générale, qui ne remplace pas un conseil juridique sur votre situation. Les règles et les délais applicables sont ceux des sources officielles citées.";

export const AGIR_VOIES: readonly AgirVoie[] = [
  {
    id: "assister",
    titre: "Assister au conseil municipal",
    texte: "Les séances du conseil municipal sont publiques.",
    liens: [
      {
        label: "Code général des collectivités territoriales, article L. 2121-18",
        url: `${LEGIFRANCE}/LEGIARTI000006389876`,
      },
    ],
  },
  {
    id: "documents",
    titre: "Obtenir un document",
    texte:
      "Toute personne peut demander communication des délibérations et des procès-verbaux du conseil municipal, des budgets et des comptes de la commune, et des arrêtés municipaux.",
    liens: [
      {
        label: "Code général des collectivités territoriales, article L. 2121-26",
        url: `${LEGIFRANCE}/LEGIARTI000044190510`,
      },
      {
        label: "Faire la demande, et que faire en cas de refus (Service Public)",
        url: `${SERVICE_PUBLIC}/F2467`,
      },
    ],
  },
  {
    id: "contacter",
    titre: "Contacter la mairie",
    texte: "Les coordonnées officielles de la mairie figurent dans l'annuaire de l'administration.",
    liens: [
      { label: "Annuaire de l'administration", url: "https://lannuaire.service-public.gouv.fr/" },
    ],
  },
  {
    id: "contester",
    titre: "Contester une décision",
    texte:
      "Une décision de la commune peut être contestée auprès de la commune elle-même, puis devant le juge administratif. Les délais sont courts : lisez-les sur les fiches officielles.",
    liens: [
      {
        label: "Recours auprès de l'administration (Service Public)",
        url: `${SERVICE_PUBLIC}/F2474`,
      },
      { label: "Saisir le juge administratif (Service Public)", url: `${SERVICE_PUBLIC}/F2478` },
      { label: "Saisir le Défenseur des droits (Service Public)", url: `${SERVICE_PUBLIC}/F13158` },
    ],
  },
];

/**
 * Territories whose entries in the commune reference have no town hall or municipal council, so
 * the block is not shown at all: the TAAF districts and Clipperton (`TERRITOIRES_SANS_COMMUNE`),
 * the three circonscriptions of Wallis-et-Futuna, and Saint-Barthélemy and Saint-Martin, where a
 * collectivité with a conseil territorial took the place of the former commune.
 */
const SANS_MAIRIE: ReadonlySet<string> = new Set([
  ...TERRITOIRES_SANS_COMMUNE,
  "977",
  "978",
  "986",
]);

export function aUneMairie(departmentCode: string): boolean {
  return !SANS_MAIRIE.has(departmentCode);
}

/**
 * New Caledonia: the same two rights, stated by its own code of communes. The list of documents
 * was not read in full, so the line sends the reader to the article instead of naming them.
 */
const NOUVELLE_CALEDONIE: Record<string, Pick<AgirVoie, "texte" | "liens">> = {
  assister: {
    texte: "Les séances du conseil municipal sont publiques.",
    liens: [
      {
        label: "Code des communes de la Nouvelle-Calédonie, article L. 121-15",
        url: `${LEGIFRANCE}/LEGIARTI000006361708`,
      },
    ],
  },
  documents: {
    texte:
      "Toute personne peut demander communication de documents de la commune : leur liste figure à l'article cité.",
    liens: [
      {
        label: "Code des communes de la Nouvelle-Calédonie, article L. 121-19",
        url: `${LEGIFRANCE}/LEGIARTI000044190844`,
      },
    ],
  },
};

/**
 * Ways shown for a commune, by department code. Read on Légifrance on 2026-11-15:
 * - Moselle, Bas-Rhin, Haut-Rhin: article L. 2541-1 of the CGCT lists the articles set aside for
 *   their communes; L. 2121-18 and L. 2121-26 are not among them, so the common text applies;
 * - Saint-Pierre-et-Miquelon: both articles apply (CGCT, art. L. 2571-1);
 * - Polynésie française: both articles apply (CGCT, art. L. 2573-5). The Service Public page on
 *   requesting a document is left out there: its application was not verified;
 * - Nouvelle-Calédonie: its own code of communes, above.
 */
export function voiesAgir(departmentCode: string): readonly AgirVoie[] {
  if (departmentCode === "988") {
    return AGIR_VOIES.map((voie) => ({ ...voie, ...NOUVELLE_CALEDONIE[voie.id] }));
  }
  if (departmentCode === "987") {
    return AGIR_VOIES.map((voie) =>
      voie.id === "documents" ? { ...voie, liens: voie.liens.slice(0, 1) } : voie
    );
  }
  return AGIR_VOIES;
}

/**
 * Seat and jurisdiction of the administrative courts, by department code: code de justice
 * administrative, article R. 221-3, in force since 9 November 2015. Only the seat is given: the
 * official name of a court is set by another article and is not always the name of its seat.
 * The courts of Saint-Barthélemy and Saint-Martin sit in Basse-Terre.
 */
const RESSORTS: readonly [siege: string, departements: readonly string[]][] = [
  ["Amiens", ["02", "60", "80"]],
  ["Bastia", ["2A", "2B"]],
  ["Besançon", ["25", "39", "70", "90"]],
  ["Bordeaux", ["24", "33", "47"]],
  ["Caen", ["14", "50", "61"]],
  ["Cergy-Pontoise", ["92", "95"]],
  ["Châlons-en-Champagne", ["08", "10", "51", "52"]],
  ["Clermont-Ferrand", ["03", "15", "43", "63"]],
  ["Dijon", ["21", "58", "71", "89"]],
  ["Grenoble", ["26", "38", "73", "74"]],
  ["Lille", ["59", "62"]],
  ["Limoges", ["19", "23", "36", "87"]],
  ["Lyon", ["01", "07", "42", "69"]],
  ["Marseille", ["04", "05", "13"]],
  ["Melun", ["77", "94"]],
  ["Montpellier", ["11", "34", "66"]],
  ["Montreuil", ["93"]],
  ["Nancy", ["54", "55", "88"]],
  ["Nantes", ["44", "49", "53", "72", "85"]],
  ["Nice", ["06"]],
  ["Nîmes", ["30", "48", "84"]],
  ["Orléans", ["18", "28", "37", "41", "45"]],
  ["Paris", ["75"]],
  ["Pau", ["32", "40", "64", "65"]],
  ["Poitiers", ["16", "17", "79", "86"]],
  ["Rennes", ["22", "29", "35", "56"]],
  ["Rouen", ["27", "76"]],
  ["Strasbourg", ["57", "67", "68"]],
  ["Toulon", ["83"]],
  ["Toulouse", ["09", "12", "31", "46", "81", "82"]],
  ["Versailles", ["78", "91"]],
  ["Basse-Terre", ["971", "977", "978"]],
  ["Schœlcher", ["972"]],
  ["Cayenne", ["973"]],
  ["Saint-Denis", ["974", "984"]],
  ["Saint-Pierre", ["975"]],
  ["Mamoudzou", ["976"]],
  ["Mata-Utu", ["986"]],
  ["Papeete", ["987", "989"]],
  ["Nouméa", ["988"]],
];

const SIEGE_PAR_DEPARTEMENT = new Map(
  RESSORTS.flatMap(([siege, departements]) => departements.map((code) => [code, siege] as const))
);

/** City where the administrative court of a department sits; null for an unknown code. */
export function siegeTribunalAdministratif(departmentCode: string): string | null {
  return SIEGE_PAR_DEPARTEMENT.get(departmentCode.toUpperCase()) ?? null;
}

export const TRIBUNAL_SOURCES: readonly AgirLien[] = [
  {
    label: "Code de justice administrative, article R. 221-3 (ressort des tribunaux)",
    url: `${LEGIFRANCE}/LEGIARTI000031459523`,
  },
  {
    label: "Code de justice administrative, article R. 312-1 (tribunal compétent)",
    url: `${LEGIFRANCE}/LEGIARTI000033340842`,
  },
];
