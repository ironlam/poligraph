import type { MandateType } from "@/generated/prisma";
import type { ParrainageMandat } from "@/config/parrainages";
import type { ParrainageRow } from "./parrainages-parse";
import { normalizeTerritoryName, type TerritoryResolution } from "./parrainages-territoires";

/**
 * Matching of a presentation to the `Politician` who made it. Pure: no network, no database.
 * The published list carries a name, a mandate and a territory, no birth date. A name alone is
 * never enough: the person must hold, in base, a dated mandate of the published type, in the
 * published territory, covering the publication date. The identity resolver then has to agree.
 */

type Territory = "COMMUNE" | "DEPARTEMENT" | "AUCUN";

/** Published mandates that exist as dated `Mandate` rows, and the territory that scopes them. */
export const MANDATE_SCOPE: Partial<
  Record<ParrainageMandat, { types: readonly MandateType[]; territory: Territory }>
> = {
  MAIRE: { types: ["MAIRE"], territory: "COMMUNE" },
  DEPUTE: { types: ["DEPUTE"], territory: "DEPARTEMENT" },
  SENATEUR: { types: ["SENATEUR"], territory: "DEPARTEMENT" },
  DEPUTE_EUROPEEN: { types: ["DEPUTE_EUROPEEN"], territory: "AUCUN" },
};

export interface MandateHolder {
  politicianId: string;
  firstName: string;
  lastName: string;
  type: MandateType;
  communeId: string | null;
  departmentCode: string | null;
  startDate: Date;
  endDate: Date | null;
}

export type EluVerdict =
  /** One holder of the mandate, there, then, under this exact name, confirmed by the resolver. */
  | "LINK"
  /** A holder under this name, but something is not established: a human decides. */
  | "REVIEW"
  /** The base knows the mayor of this commune on that date, under another name. */
  | "AUTRE_TITULAIRE"
  /** The base has no dated mandate of this type, there and then, under this name. */
  | "SANS_MANDAT"
  /** Mandate type not stored as a dated mandate, or territory not resolved. */
  | "HORS_PERIMETRE";

export interface EluMatch {
  verdict: EluVerdict;
  politicianId: string | null;
  reason: string;
}

const key = (name: string) => normalizeTerritoryName(name);

function covers(holder: MandateHolder, date: Date): boolean {
  return holder.startDate <= date && (holder.endDate === null || holder.endDate >= date);
}

export function matchElu(
  row: Pick<ParrainageRow, "mandat" | "lastName" | "firstName" | "publishedOn">,
  territory: Pick<TerritoryResolution, "communeCode" | "departmentCode">,
  holders: readonly MandateHolder[],
  /** Politician the identity resolver judged SAME for this row, null otherwise. */
  resolverSameId: string | null
): EluMatch {
  const none = (verdict: EluVerdict, reason: string): EluMatch => ({
    verdict,
    politicianId: null,
    reason,
  });
  const scope = row.mandat ? MANDATE_SCOPE[row.mandat] : undefined;
  if (!scope) return none("HORS_PERIMETRE", "mandat non suivi par des mandats datés");
  if (scope.territory === "COMMUNE" && !territory.communeCode) {
    return none("HORS_PERIMETRE", "commune non résolue");
  }
  if (scope.territory === "DEPARTEMENT" && !territory.departmentCode) {
    return none("HORS_PERIMETRE", "département non résolu");
  }

  const date = new Date(`${row.publishedOn}T00:00:00Z`);
  const inOffice = holders.filter((h) => scope.types.includes(h.type) && covers(h, date));
  const there = inOffice.filter((h) => {
    if (scope.territory === "COMMUNE") return h.communeId === territory.communeCode;
    if (scope.territory === "DEPARTEMENT") return h.departmentCode === territory.departmentCode;
    return true;
  });
  // A mandate stored without its department can neither confirm nor contradict the territory.
  const unplaced =
    scope.territory === "DEPARTEMENT" ? inOffice.filter((h) => h.departmentCode === null) : [];

  const sameName = (h: MandateHolder) =>
    key(h.lastName) === key(row.lastName) && key(h.firstName) === key(row.firstName);
  const named = [...new Set(there.filter(sameName).map((h) => h.politicianId))];

  if (named.length > 1) return none("REVIEW", "plusieurs titulaires du même nom");
  if (named.length === 1) {
    const politicianId = named[0]!;
    return resolverSameId === politicianId
      ? { verdict: "LINK", politicianId, reason: "mandat, territoire, date, nom et résolveur" }
      : { verdict: "REVIEW", politicianId, reason: "titulaire trouvé, résolveur non concordant" };
  }
  const unplacedNamed = [...new Set(unplaced.filter(sameName).map((h) => h.politicianId))];
  if (unplacedNamed.length === 1) {
    return {
      verdict: "REVIEW",
      politicianId: unplacedNamed[0]!,
      reason: "mandat en base sans département",
    };
  }
  // Only a commune has a single holder: elsewhere, other names in office prove nothing.
  return there.length && scope.territory === "COMMUNE"
    ? none("AUTRE_TITULAIRE", "un autre maire est en base à cette date")
    : none("SANS_MANDAT", "aucun mandat daté en base sous ce nom pour ce territoire");
}

export type ElusReport = Record<EluVerdict, number>;

export function summarizeEluMatches(matches: readonly EluMatch[]): ElusReport {
  const report: ElusReport = {
    LINK: 0,
    REVIEW: 0,
    AUTRE_TITULAIRE: 0,
    SANS_MANDAT: 0,
    HORS_PERIMETRE: 0,
  };
  for (const match of matches) report[match.verdict] += 1;
  return report;
}
