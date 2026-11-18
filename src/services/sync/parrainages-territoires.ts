import type { ParrainageMandat } from "@/config/parrainages";
import type { ParrainageRow } from "./parrainages-parse";

/**
 * Territory resolution of a presidential presentation. The published list names the department
 * and, for a mayor, the commune, without any INSEE code. Pure: the reference tables are passed
 * in. The match is exact after normalisation; a name that is ambiguous or absent stays
 * unresolved, never guessed.
 */

export type TerritoryStatus =
  /** One and only one territory carries this name. */
  | "RESOLVED"
  /** Several territories carry this name: none is chosen. */
  | "AMBIGUOUS"
  /** No territory of the reference tables carries this name (merged commune, other spelling). */
  | "NOT_FOUND"
  /** The row names no territory of this level (a senator has no commune, an MEP no department). */
  | "NOT_APPLICABLE";

export interface TerritoryResolution {
  departmentCode: string | null;
  departmentStatus: TerritoryStatus;
  communeCode: string | null;
  communeStatus: TerritoryStatus;
}

/** Labels of the "Département" column that are not a territory. */
const NON_TERRITORIAL_LABELS = new Set(["parlement europeen", "francais de l etranger"]);

/** Mandates whose "Circonscription" column is a commune name. */
const COMMUNE_MANDATS: ReadonlySet<ParrainageMandat> = new Set(["MAIRE", "MAIRE_DELEGUE"]);

const ARTICLES = "le|la|les|l";

/**
 * Case, accents, ligatures, hyphens and apostrophes are folded, and an article written after the
 * name ("Île-des-Pins (L')") is moved back in front ("l ile des pins").
 */
export function normalizeTerritoryName(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const trailing = new RegExp(`^(.*\\S)\\s*\\((${ARTICLES})\\s*\\)$`).exec(folded);
  return trailing ? `${trailing[2]} ${trailing[1]}` : folded;
}

export interface TerritoryIndex {
  departmentCodes: ReadonlyMap<string, readonly string[]>;
  /** Key: department code, a tab, the normalised commune name. */
  communeCodes: ReadonlyMap<string, readonly string[]>;
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

export function buildTerritoryIndex(
  departments: Readonly<Record<string, { name: string }>>,
  communes: readonly { id: string; name: string; departmentCode: string }[]
): TerritoryIndex {
  const departmentCodes = new Map<string, string[]>();
  for (const [code, { name }] of Object.entries(departments)) {
    push(departmentCodes, normalizeTerritoryName(name), code);
  }
  const communeCodes = new Map<string, string[]>();
  for (const commune of communes) {
    push(
      communeCodes,
      `${commune.departmentCode}\t${normalizeTerritoryName(commune.name)}`,
      commune.id
    );
  }
  return { departmentCodes, communeCodes };
}

function lookup(
  codes: readonly string[] | undefined
): Pick<TerritoryResolution, "communeCode" | "communeStatus"> {
  if (!codes?.length) return { communeCode: null, communeStatus: "NOT_FOUND" };
  if (codes.length > 1) return { communeCode: null, communeStatus: "AMBIGUOUS" };
  return { communeCode: codes[0]!, communeStatus: "RESOLVED" };
}

export function resolveParrainageTerritory(
  row: Pick<ParrainageRow, "mandat" | "constituencyLabel" | "departmentLabel">,
  index: TerritoryIndex
): TerritoryResolution {
  const isCommuneRow = row.mandat !== null && COMMUNE_MANDATS.has(row.mandat);
  const none = { communeCode: null, communeStatus: "NOT_APPLICABLE" } as const;

  const departmentName = normalizeTerritoryName(row.departmentLabel);
  if (NON_TERRITORIAL_LABELS.has(departmentName)) {
    return { departmentCode: null, departmentStatus: "NOT_APPLICABLE", ...none };
  }
  const department = lookup(index.departmentCodes.get(departmentName));
  if (!department.communeCode) {
    // Without a department, a commune name alone would be a guess: thousands are homonyms.
    return {
      departmentCode: null,
      departmentStatus: department.communeStatus,
      ...(isCommuneRow ? { communeCode: null, communeStatus: department.communeStatus } : none),
    };
  }

  const departmentCode = department.communeCode;
  if (!isCommuneRow || !row.constituencyLabel) {
    return { departmentCode, departmentStatus: "RESOLVED", ...none };
  }
  const key = `${departmentCode}\t${normalizeTerritoryName(row.constituencyLabel)}`;
  return { departmentCode, departmentStatus: "RESOLVED", ...lookup(index.communeCodes.get(key)) };
}

export type TerritoryReport = Record<"department" | "commune", Record<TerritoryStatus, number>>;

/** Counts of each verdict, for the importer preview. */
export function summarizeTerritoryResolutions(
  resolutions: readonly TerritoryResolution[]
): TerritoryReport {
  const empty = () => ({ RESOLVED: 0, AMBIGUOUS: 0, NOT_FOUND: 0, NOT_APPLICABLE: 0 });
  const report: TerritoryReport = { department: empty(), commune: empty() };
  for (const resolution of resolutions) {
    report.department[resolution.departmentStatus] += 1;
    report.commune[resolution.communeStatus] += 1;
  }
  return report;
}
