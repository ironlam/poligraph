/**
 * Lecture pure du fichier RNE des conseillers d'arrondissement (issue #587).
 *
 * Séparé du service pour la même raison que `rne-parse` l'est de `rne` : ce
 * module ne touche pas la base, donc ses tests n'ont besoin d'aucune connexion.
 */
import { parse } from "csv-parse/sync";
// Une seule convention de date pour tout le RNE : minuit heure de Paris.
import { parseFrenchDate } from "./rne-parse";

/** La fonction, telle que le RNE l'orthographie, qui désigne le maire du secteur. */
const MAYOR_FUNCTION = "maire d'arrondissement";

export interface ArrondissementMayorRow {
  communeId: string;
  communeName: string;
  sectorLabel: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: Date | null;
  departmentCode: string;
  mandateStart: Date | null;
  functionStart: Date | null;
}

/** Casse, accents et traits d'union écartés : le RNE crie les patronymes. */
export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function parseArrondissementRows(csvText: string): ArrondissementMayorRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as Record<string, string>[];

  const rows: ArrondissementMayorRow[] = [];
  for (const record of records) {
    const fonction = (record["Libellé de la fonction"] ?? "").trim().toLowerCase();
    // Égalité stricte, pas une inclusion : « 1er adjoint au maire
    // d'arrondissement » contient la même chaîne et n'est pas un maire.
    if (fonction !== MAYOR_FUNCTION) continue;

    const firstName = (record["Prénom de l'élu"] ?? "").trim();
    const lastName = (record["Nom de l'élu"] ?? "").trim();
    const communeId = (record["Code de la commune"] ?? "").trim();
    if (!firstName || !lastName || !communeId) continue;

    rows.push({
      communeId,
      communeName: (record["Libellé de la commune"] ?? "").trim(),
      sectorLabel: (record["Libellé du secteur"] ?? "").trim(),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      birthDate: parseFrenchDate(record["Date de naissance"] ?? ""),
      departmentCode: (record["Code du département"] ?? "").trim(),
      mandateStart: parseFrenchDate(record["Date de début du mandat"] ?? ""),
      functionStart: parseFrenchDate(record["Date de début de la fonction"] ?? ""),
    });
  }
  return rows;
}
