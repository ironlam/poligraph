/**
 * Seats of the 2026 municipal lists: pure matching between the lists of the ministry file and
 * the candidacies in base. Seats are written on the head of each list only (`listPosition = 1`),
 * the row the commune page reads: one row per list instead of every member.
 */

import { normalizeListName } from "./resultats-t1";
import type { CommuneResult2026, ListResult2026 } from "./parse-wide-results-2026";

type NamedCandidacy = { id: string; listName: string | null };

/** Candidacies of one commune matching a list: exact name, then short label, then keywords. */
export function matchListCandidacies(
  candidacies: NamedCandidacy[],
  list: Pick<ListResult2026, "listName" | "listShortName">
): { ids: string[]; partial: boolean } {
  const named = candidacies.flatMap((c) =>
    c.listName ? [{ id: c.id, norm: normalizeListName(c.listName) }] : []
  );
  const idsWhere = (test: (norm: string) => boolean) =>
    named.filter((c) => test(c.norm)).map((c) => c.id);

  const normalizedName = normalizeListName(list.listName);
  let ids = idsWhere((norm) => norm === normalizedName);
  if (ids.length === 0 && list.listShortName) {
    const normalizedShort = normalizeListName(list.listShortName);
    ids = idsWhere((norm) => norm === normalizedShort);
  }
  if (ids.length > 0) return { ids, partial: false };

  const words = normalizedName
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 3);
  if (words.length === 0) return { ids: [], partial: false };
  ids = idsWhere((norm) => words.every((w) => norm.includes(w)));
  return { ids, partial: ids.length > 0 };
}

export interface ListHead extends NamedCandidacy {
  communeId: string;
  candidateName: string;
}

/**
 * Head of list carrying the name of the person who leads the list in the file. Used when the list
 * name is unknown in base: a list merged between the rounds takes a new name but keeps, as its
 * leader, the head of one of the first-round lists. Only a single, exact name counts.
 */
export function matchHeadByPerson(
  heads: ListHead[],
  list: Pick<ListResult2026, "lastName" | "firstName">
): string | null {
  if (!list.lastName.trim() || !list.firstName.trim()) return null;
  const names = [`${list.firstName} ${list.lastName}`, `${list.lastName} ${list.firstName}`].map(
    normalizeListName
  );
  const found = heads.filter((head) => names.includes(normalizeListName(head.candidateName)));
  return found.length === 1 ? found[0]!.id : null;
}

export interface SeatWritePlan {
  rows: { id: string; seats: number }[];
  /** Heads of list of the incomplete communes: their seats are erased, not left partial. */
  clear: string[];
  communes: number;
  incompleteCommunes: number;
  lists: number;
  seats: number;
  /** Lists that could not be matched, each with its reason. */
  skipped: string[];
}

/**
 * One write per list with published seats, on its head of list, matched by exact list name or
 * short label, else by the name of the person leading the list. All or nothing per commune: when one list matches no head, several heads, or a head
 * already taken by another list, the commune gets no seats at all and loses those it had, so that
 * seats in base always add up to the whole council.
 */
export function planSeatWrites(communes: CommuneResult2026[], heads: ListHead[]): SeatWritePlan {
  const headsByCommune = new Map<string, ListHead[]>();
  for (const head of heads) {
    const group = headsByCommune.get(head.communeId);
    if (group) group.push(head);
    else headsByCommune.set(head.communeId, [head]);
  }

  const plan: SeatWritePlan = {
    rows: [],
    clear: [],
    communes: 0,
    incompleteCommunes: 0,
    lists: 0,
    seats: 0,
    skipped: [],
  };
  for (const commune of communes) {
    const communeHeads = headsByCommune.get(commune.inseeCode);
    const withSeats = commune.lists.filter((list) => list.seatsCM != null);
    if (!communeHeads || withSeats.length === 0) continue;
    plan.communes++;
    const rows: SeatWritePlan["rows"] = [];
    const taken = new Set<string>();
    let complete = true;
    for (const list of withSeats) {
      plan.lists++;
      plan.seats += list.seatsCM!;
      const { ids, partial } = matchListCandidacies(communeHeads, list);
      const label = `"${list.listName}" in ${commune.inseeCode}`;
      // A keyword match is a guess: a list merged between the rounds shares words with one of
      // the lists it replaces, and its seats would land on that other list.
      let reason: string | null = null;
      if (ids.length === 0 || partial) {
        const byPerson = matchHeadByPerson(communeHeads, list);
        if (byPerson) ids.splice(0, ids.length, byPerson);
        else reason = "no match";
      } else if (ids.length > 1) reason = `${ids.length} heads match`;
      if (!reason && taken.has(ids[0]!)) reason = "head already taken";
      if (reason) {
        plan.skipped.push(`${reason}: ${label}`);
        complete = false;
        continue;
      }
      taken.add(ids[0]!);
      rows.push({ id: ids[0]!, seats: list.seatsCM! });
    }
    if (complete) plan.rows.push(...rows);
    else {
      plan.incompleteCommunes++;
      plan.clear.push(...communeHeads.map((head) => head.id));
    }
  }
  return plan;
}
