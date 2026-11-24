import { Judgement } from "@/generated/prisma";
import { getDepartmentName } from "@/config/departments";
import { getRegionByCode } from "@/config/regions";
import type { ResolveResult } from "@/lib/identity";
import { FIRST_NAME_EXACT_LLR } from "@/lib/identity/signals/constants";
import { functionRank } from "@/lib/territoires/executif";
import { generateSlug } from "@/lib/utils";
import { parseConseilRows, type ConseilMembreRow } from "./conseils-parse";
import { parseFrenchDate } from "./rne-parse";

/**
 * Linking of the presidents of departmental and regional councils to a `Politician` (D22).
 * Pure: no network, no database.
 */

export type ExecutifNiveau = "DEPARTEMENTAL" | "REGIONAL";

/**
 * A president line of the RNE file. The birth date is never written onto an existing profile;
 * it is stored only on a profile created from this line (see `buildExecutifIdentity`).
 */
export interface PresidentRow extends ConseilMembreRow {
  niveau: ExecutifNiveau;
  birthDate: Date | null;
}

/**
 * "CHESNAIS-GIRARD" -> "Chesnais-Girard". The shared RNE `normalizeName` turns hyphens into
 * spaces, which is harmless for matching (the resolver does the same) but wrong on a public
 * profile created from the line. Accents the register omits are not restored.
 */
export function formatRegisterName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join("-")
    )
    .join(" ");
}

export function parsePresidentRows(
  niveau: ExecutifNiveau,
  records: Record<string, string | undefined>[]
): PresidentRow[] {
  return records.flatMap((record) => {
    if (functionRank(record["Libellé de la fonction"]?.trim() || null) !== 0) return [];
    const [row] = parseConseilRows(niveau, [record]).rows;
    if (!row) return [];
    return [
      {
        ...row,
        niveau,
        firstName: formatRegisterName(record["Prénom de l'élu"]!),
        lastName: formatRegisterName(record["Nom de l'élu"]!),
        birthDate: parseFrenchDate(record["Date de naissance"] ?? ""),
      },
    ];
  });
}

export function executifSourceId(row: Pick<PresidentRow, "niveau" | "rowKey">): string {
  return `conseil:${row.niveau}:${row.rowKey}`;
}

/**
 * - LINK: same person, the mandate can be written.
 * - REVIEW: plausible, a human decides (an UNDECIDED `IdentityDecision` is written).
 * - HOMONYME: same family name, another first name. Reported, nothing written.
 * - SANS_FICHE: no candidate.
 */
export type ExecutifVerdict = "LINK" | "REVIEW" | "HOMONYME" | "SANS_FICHE";

/**
 * The resolver's SAME is not enough here. Measured on production on 2026-11-15, the rarity of a
 * family name alone carried SAME over a different first name (4 of 27 without birth date, 1 of
 * 19 with it). A link therefore also requires an exact first name AND a matching birth date.
 * A prior decision confirmed SAME (by this rule or by a reviewer) comes back with no candidate
 * list: it is trusted as is.
 */
export function classifyExecutif(result: ResolveResult | undefined): ExecutifVerdict {
  if (!result?.politicianId) return "SANS_FICHE";
  if (result.decision === Judgement.SAME && result.candidates.length === 0) return "LINK";

  const signals =
    result.candidates.find((c) => c.politicianId === result.politicianId)?.fellegiSunter?.signals ??
    [];
  const logLR = (id: string) => signals.find((s) => s.id === id)?.logLR ?? 0;
  const firstNameExact = logLR("first-name") === FIRST_NAME_EXACT_LLR;
  const birthDateMatches = logLR("birthdate") > 0;

  if (result.decision === Judgement.SAME && firstNameExact && birthDateMatches) return "LINK";
  if (result.decision === Judgement.SAME || firstNameExact) return "REVIEW";
  return "HOMONYME";
}

export interface ExecutifMandateData {
  type: "PRESIDENT_DEPARTEMENT" | "PRESIDENT_REGION";
  title: string;
  institution: string;
  constituency: string;
  departmentCode: string | null;
  startDate: Date;
}

/**
 * Mandate fields for a president line, or null when the territory is not in the referentials
 * or the register gives no start date: nothing is guessed. `constituency` carries the region
 * name because it is the key `readRegionTerritoire` reads a regional presidency by.
 */
export function buildExecutifMandate(row: PresidentRow): ExecutifMandateData | null {
  const startDate = row.functionStart ?? row.mandateStart;
  if (!startDate) return null;
  const president = row.gender === "F" ? "Présidente" : "Président";

  if (row.niveau === "DEPARTEMENTAL") {
    const name = getDepartmentName(row.territoryCode);
    if (!name) return null;
    return {
      type: "PRESIDENT_DEPARTEMENT",
      title: `${president} du conseil départemental (${name})`,
      institution: `Conseil départemental (${name})`,
      constituency: name,
      departmentCode: row.territoryCode,
      startDate,
    };
  }

  const region = getRegionByCode(row.territoryCode);
  if (!region) return null;
  return {
    type: "PRESIDENT_REGION",
    title: `${president} du conseil régional (${region.name})`,
    institution: `Conseil régional (${region.name})`,
    constituency: region.name,
    departmentCode: region.departmentCodes.length === 1 ? region.departmentCodes[0]! : null,
    startDate,
  };
}

export interface ExecutifIdentity {
  slug: string;
  civility: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: Date | null;
}

/**
 * Civil status of a profile created for a president with no profile (SANS_FICHE), from the
 * register line only, as `createMaire` does for mayors. `slugTaken` adds the territory code, the
 * way a mayor's slug takes the INSEE code.
 */
export function buildExecutifIdentity(row: PresidentRow, slugTaken: boolean): ExecutifIdentity {
  const fullName = `${row.firstName} ${row.lastName}`;
  const baseSlug = generateSlug(fullName);
  return {
    slug: slugTaken ? `${baseSlug}-${generateSlug(row.territoryCode)}` : baseSlug,
    civility: row.gender === "F" ? "Mme" : row.gender === "M" ? "M." : null,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName,
    birthDate: row.birthDate,
  };
}

/**
 * True when the register cannot vouch for the presidency any more: the person started a
 * parliamentary mandate after the file was published. A member of Parliament may not chair a
 * departmental or regional council, so one of the two ended and the file does not say which.
 * Measured 2026-11-15: a file of 11 August listed six presidents elected senators on 1 October.
 * Without a file date, any current parliamentary mandate holds the link back.
 */
export function registreDepasse(registerDate: Date | null, mandatsParlementaires: Date[]): boolean {
  if (!registerDate) return mandatsParlementaires.length > 0;
  return mandatsParlementaires.some((start) => start > registerDate);
}
