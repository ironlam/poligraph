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
  /** Set when the published name is a commune that has since merged or been renamed. */
  communeViaSuccessor?: true;
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
  /** Same key, for the former names of communes that merged or were renamed since the list. */
  successorCodes: ReadonlyMap<string, readonly string[]>;
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/** One line of the INSEE file of commune events (Code officiel géographique, `v_mvt_commune`). */
export interface CommuneEvent {
  DATE_EFF: string;
  TYPECOM_AV: string;
  COM_AV: string;
  LIBELLE_AV: string;
  TYPECOM_AP: string;
  COM_AP: string;
}

const departmentOf = (code: string) => code.slice(0, /^9[78]/.test(code) ? 3 : 2);

/**
 * Former commune names to the code that carries them today, from the official events dated after
 * `after` (ISO date). A merger is followed to its end: a commune absorbed in 2024 by one that
 * merged again in 2025 answers with the last one. A name two communes of today can claim keeps
 * both codes, so the resolver refuses to choose. Only codes of `knownCommuneIds` are kept.
 */
export function buildCommuneSuccessors(
  events: readonly CommuneEvent[],
  after: string,
  knownCommuneIds: ReadonlySet<string>
): Map<string, string[]> {
  const moves = events.filter(
    (e) => e.DATE_EFF > after && e.TYPECOM_AV === "COM" && e.TYPECOM_AP === "COM"
  );
  const byOrigin = new Map<string, CommuneEvent[]>();
  for (const e of moves) byOrigin.set(e.COM_AV, [...(byOrigin.get(e.COM_AV) ?? []), e]);
  // Events are followed in date order: the next step of a code is its earliest later event.
  const finalCodes = (code: string, since: string, depth = 0): string[] => {
    const later = (byOrigin.get(code) ?? []).filter((e) => e.DATE_EFF > since);
    if (!later.length || depth > 5) return [code];
    const step = later.map((e) => e.DATE_EFF).sort()[0]!;
    return later
      .filter((e) => e.DATE_EFF === step)
      .flatMap((e) => finalCodes(e.COM_AP, step, depth + 1));
  };

  const successors = new Map<string, string[]>();
  for (const e of moves) {
    const key = `${departmentOf(e.COM_AV)}\t${normalizeTerritoryName(e.LIBELLE_AV)}`;
    for (const code of finalCodes(e.COM_AP, e.DATE_EFF)) {
      if (knownCommuneIds.has(code)) push(successors, key, code);
    }
  }
  return successors;
}

export function buildTerritoryIndex(
  departments: Readonly<Record<string, { name: string }>>,
  communes: readonly { id: string; name: string; departmentCode: string }[],
  successorCodes: ReadonlyMap<string, readonly string[]> = new Map()
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
  return { departmentCodes, communeCodes, successorCodes };
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
  const direct = lookup(index.communeCodes.get(key));
  if (direct.communeStatus !== "NOT_FOUND") {
    return { departmentCode, departmentStatus: "RESOLVED", ...direct };
  }
  // Only when today's table no longer carries the name: the official successor, if it is unique.
  const successor = lookup(index.successorCodes.get(key));
  return {
    departmentCode,
    departmentStatus: "RESOLVED",
    ...successor,
    ...(successor.communeCode ? { communeViaSuccessor: true as const } : {}),
  };
}

export type TerritoryReport = Record<"department" | "commune", Record<TerritoryStatus, number>> & {
  /** Communes resolved through a merger or a renaming, counted inside `commune.RESOLVED`. */
  viaSuccessor: number;
};

/** Counts of each verdict, for the importer preview. */
export function summarizeTerritoryResolutions(
  resolutions: readonly TerritoryResolution[]
): TerritoryReport {
  const empty = () => ({ RESOLVED: 0, AMBIGUOUS: 0, NOT_FOUND: 0, NOT_APPLICABLE: 0 });
  const report: TerritoryReport = { department: empty(), commune: empty(), viaSuccessor: 0 };
  for (const resolution of resolutions) {
    report.department[resolution.departmentStatus] += 1;
    report.commune[resolution.communeStatus] += 1;
    if (resolution.communeViaSuccessor) report.viaSuccessor += 1;
  }
  return report;
}
