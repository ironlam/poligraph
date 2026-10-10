// Affaires des membres des gouvernements, pour le filtre « Affaires judiciaires » de la page
// Membres. Le périmètre est celui des agrégats à charge (`getAdverseAffairWhere`) : affaires
// publiées, personne directement mise en cause, ordre pénal, procédures validées par un juge ou
// condamnations. Jamais d'enquête préliminaire ni d'issue favorable.

import type { AffairStatus } from "@/generated/prisma";
import {
  DEFINITIVE_CONVICTION_STATUSES,
  NON_DEFINITIVE_CONVICTION_STATUSES,
  PROCEDURE_VALIDEE_STATUSES,
} from "@/config/judicial-maturity";

export type MembersAffairsFilter = "toutes" | "condamnation" | "condamnation-definitive";

export const AFFAIRS_FILTERS: readonly MembersAffairsFilter[] = [
  "toutes",
  "condamnation",
  "condamnation-definitive",
];

export type MemberAffairs = { definitive: number; nonDefinitive: number; ongoing: number };

/** Par identifiant de personne ; une personne sans affaire à charge n'a pas d'entrée. */
export type MemberAffairsMap = Record<string, MemberAffairs>;

export function summarizeAffairs(
  rows: { politicianId: string; status: AffairStatus }[]
): MemberAffairsMap {
  const map: MemberAffairsMap = {};
  for (const { politicianId, status } of rows) {
    const key = DEFINITIVE_CONVICTION_STATUSES.includes(status)
      ? "definitive"
      : NON_DEFINITIVE_CONVICTION_STATUSES.includes(status)
        ? "nonDefinitive"
        : PROCEDURE_VALIDEE_STATUSES.includes(status)
          ? "ongoing"
          : null;
    if (!key) continue;
    const entry = (map[politicianId] ??= { definitive: 0, nonDefinitive: 0, ongoing: 0 });
    entry[key] += 1;
  }
  return map;
}

export function matchesAffairsFilter(
  affairs: MemberAffairs | undefined,
  filter: MembersAffairsFilter
): boolean {
  if (!affairs) return false;
  if (filter === "condamnation-definitive") return affairs.definitive > 0;
  if (filter === "condamnation") return affairs.definitive + affairs.nonDefinitive > 0;
  return affairs.definitive + affairs.nonDefinitive + affairs.ongoing > 0;
}
