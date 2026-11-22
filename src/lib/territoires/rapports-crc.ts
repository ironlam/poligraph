/**
 * Reading of a regional audit chamber publication (Territoires v2, lot C). Pure.
 *
 * The title of a ccomptes.fr publication names the audited body in plain words: "Commune de
 * Chartres (Eure-et-Loir)", "Département de la Meuse", "Région Bourgogne-Franche-Comté -
 * alimentation durable". Only titles that open on a commune, a department or a region are read;
 * every other body (intercommunality, syndicate, hospital, association) and every free-form title
 * ("La gestion des fonds européens par la Région Occitanie") comes back with `collectivite: null`.
 * What is read is a proposal: the territory is resolved and checked by a person afterwards.
 */

import { DEPARTMENTS } from "@/config/departments";
import { REGIONS } from "@/config/regions";

export type CollectiviteType = "COMMUNE" | "DEPARTEMENT" | "REGION";

export interface TitreRapportCrc {
  collectivite: {
    type: CollectiviteType;
    /** Name as the title writes it, preposition and lowercase article removed. */
    nom: string;
    /** The opening of the title up to the name, as the source writes it: "Département de la Meuse". */
    libelle: string;
    /** Department named between brackets, or the department itself. Null for a region. */
    departement: string | null;
  } | null;
  /** "Cahier n°2": one report published in several parts, each at its own address. */
  cahier: number | null;
  /** "(2e avis)": the title of a budget opinion that follows a first one. */
  rangAvis: number | null;
}

export type DocumentRapportCrc = "RAPPORT_OBSERVATIONS_DEFINITIVES" | "AVIS_BUDGETAIRE" | "AUTRE";

const AVIS = /\((\d+)\s*(?:e|ème)\s+avis\)/i;
const CAHIER = /cahier\s*n\s*°\s*(\d+)/i;
const PARENTHESES = /\(([^()]+)\)/g;
/** Where the name stops: a bracket, a subtitle after a colon or a dash, or a part number. */
const FIN_NOM = /\s+(?:\(|:|-\s|cahier\b)|\s*$/i;

const TETES: Array<{ type: CollectiviteType; motif: RegExp }> = [
  { type: "COMMUNE", motif: /^commune\s+(?:de\s+|d')/i },
  { type: "DEPARTEMENT", motif: /^département\s+(?:des\s+|du\s+|de\s+|d')/i },
  { type: "REGION", motif: /^région\s+/i },
];

function normaliser(titre: string): string {
  return titre.replace(/[’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

/** "la Meuse" -> "Meuse", "l'Aisne" -> "Aisne"; "La Réunion" keeps its capital article. */
function sansArticle(nom: string): string {
  return nom.replace(/^(?:la\s+|l')/, "");
}

export function parseTitreRapportCrc(titreBrut: string): TitreRapportCrc {
  const titre = normaliser(titreBrut);
  const avis = AVIS.exec(titre);
  const cahier = CAHIER.exec(titre);
  const resultat: TitreRapportCrc = {
    collectivite: null,
    cahier: cahier ? Number(cahier[1]) : null,
    rangAvis: avis ? Number(avis[1]) : null,
  };

  const tete = TETES.find((t) => t.motif.test(titre));
  if (!tete) return resultat;
  const reste = titre.replace(tete.motif, "");
  const fin = reste.search(FIN_NOM);
  const brut = reste.slice(0, fin).trim();
  // A commune name carries its article ("La Roche-Posay"); a department is written "de la Meuse".
  const nom = tete.type === "DEPARTEMENT" ? sansArticle(brut) : brut;
  if (!nom) return resultat;

  let departement: string | null = null;
  if (tete.type === "DEPARTEMENT") departement = nom;
  if (tete.type !== "REGION") {
    // The bracket right after the name, else the last one: "Commune de Voiron : les dépenses de
    // rémunération du personnel (Isère)". A region title brackets the seat or a series, never
    // the region itself.
    const parentheses = [...reste.matchAll(PARENTHESES)]
      .filter((m) => !AVIS.test(m[0]))
      .map((m) => ({ index: m.index, texte: m[1]!.trim() }));
    const suivante = parentheses.find((p) => reste.slice(fin, p.index).trim() === "");
    departement = (suivante ?? parentheses.at(-1))?.texte ?? departement;
  }

  const libelle = titre.slice(0, titre.length - reste.length) + brut;
  resultat.collectivite = { type: tete.type, nom, libelle, departement };
  return resultat;
}

function decoderAttribut(valeur: string): string {
  return valeur
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Kind of document of a publication page, from the `data-document` label of its download
 * buttons ("Rapport d'observations définitives", "Avis de contrôle budgétaire", "Communiqué de
 * presse"). A final observations report wins over the press release that goes with it.
 */
export function parseDocumentRapportCrc(html: string): DocumentRapportCrc | null {
  const libelles = [...html.matchAll(/data-document="([^"]{1,200})"/g)].map((m) =>
    decoderAttribut(m[1]!).trim().toLowerCase()
  );
  if (libelles.length === 0) return null;
  if (libelles.some((l) => l.startsWith("rapport d'observations définitives"))) {
    return "RAPPORT_OBSERVATIONS_DEFINITIVES";
  }
  if (libelles.some((l) => l.startsWith("avis"))) return "AVIS_BUDGETAIRE";
  return "AUTRE";
}

/**
 * Comparison key of a name: case, hyphens, apostrophes and spacing ignored, accents kept. The
 * feed writes "Montceau-les Mines" for "Montceau-les-Mines": nothing looser is accepted.
 */
function cle(nom: string): string {
  return nom
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’ʼ'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "la réunion" and "réunion" are the same department or region: "Région Réunion". */
const cleSansArticle = (nom: string) => cle(nom).replace(/^(?:la|le|les|l) /, "");

/** Code of the department named exactly so, or null. */
export function departementParNom(nom: string): string | null {
  const k = cleSansArticle(nom);
  const codes = Object.keys(DEPARTMENTS).filter((c) => cleSansArticle(DEPARTMENTS[c]!.name) === k);
  return codes.length === 1 ? codes[0]! : null;
}

export type TerritoireRapport = {
  territoryType: "COM" | "DEP" | "REG";
  /** Null when no single territory carries that exact name: a person chooses in the admin. */
  territoryCode: string | null;
  motif: "PROPOSE" | "DEPARTEMENT_INCONNU" | "INTROUVABLE" | "AMBIGU";
};

/**
 * The territory a report title names, as a proposal. Exact name only, and for a commune only
 * inside the department the title gives: two communes of the same name in that department, or
 * none, leave the code empty. `communesDuDepartement` holds the communes of `departement`.
 */
export function rattacherRapport(
  collectivite: NonNullable<TitreRapportCrc["collectivite"]>,
  communesDuDepartement: (code: string) => Array<{ id: string; name: string }>
): TerritoireRapport {
  const sans = (
    territoryType: TerritoireRapport["territoryType"],
    motif: TerritoireRapport["motif"]
  ) => ({ territoryType, territoryCode: null, motif }) as const;

  if (collectivite.type === "REGION") {
    const k = cleSansArticle(collectivite.nom);
    const region = REGIONS.filter((r) => cleSansArticle(r.name) === k);
    if (region.length !== 1) return sans("REG", region.length ? "AMBIGU" : "INTROUVABLE");
    return { territoryType: "REG", territoryCode: region[0]!.code, motif: "PROPOSE" };
  }

  const departement = collectivite.departement ? departementParNom(collectivite.departement) : null;
  if (collectivite.type === "DEPARTEMENT") {
    if (!departement) return sans("DEP", "INTROUVABLE");
    return { territoryType: "DEP", territoryCode: departement, motif: "PROPOSE" };
  }

  if (!departement) return sans("COM", "DEPARTEMENT_INCONNU");
  const k = cle(collectivite.nom);
  const communes = communesDuDepartement(departement).filter((c) => cle(c.name) === k);
  if (communes.length !== 1) return sans("COM", communes.length ? "AMBIGU" : "INTROUVABLE");
  return { territoryType: "COM", territoryCode: communes[0]!.id, motif: "PROPOSE" };
}
