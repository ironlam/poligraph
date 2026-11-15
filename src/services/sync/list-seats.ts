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
}

export interface SeatWritePlan {
  rows: { id: string; seats: number }[];
  communes: number;
  lists: number;
  seats: number;
  /** Lists left out, each with its reason: nothing is written on a doubtful match. */
  skipped: string[];
}

/**
 * One write per list with published seats, on its head of list, matched by exact name or short
 * label only. A list matching no head, several heads, or a head already taken by another list is
 * left out and reported.
 */
export function planSeatWrites(communes: CommuneResult2026[], heads: ListHead[]): SeatWritePlan {
  const headsByCommune = new Map<string, ListHead[]>();
  for (const head of heads) {
    const group = headsByCommune.get(head.communeId);
    if (group) group.push(head);
    else headsByCommune.set(head.communeId, [head]);
  }

  const plan: SeatWritePlan = { rows: [], communes: 0, lists: 0, seats: 0, skipped: [] };
  const taken = new Set<string>();
  for (const commune of communes) {
    const communeHeads = headsByCommune.get(commune.inseeCode);
    const withSeats = commune.lists.filter((list) => list.seatsCM != null);
    if (!communeHeads || withSeats.length === 0) continue;
    plan.communes++;
    for (const list of withSeats) {
      plan.lists++;
      plan.seats += list.seatsCM!;
      const { ids, partial } = matchListCandidacies(communeHeads, list);
      const label = `"${list.listName}" in ${commune.inseeCode}`;
      // A keyword match is a guess: a list merged between the rounds shares words with one of
      // the lists it replaces, and its seats would land on that other list.
      if (ids.length === 0 || partial) plan.skipped.push(`no match: ${label}`);
      else if (ids.length > 1) plan.skipped.push(`${ids.length} heads match: ${label}`);
      else if (taken.has(ids[0]!)) plan.skipped.push(`head already taken: ${label}`);
      else {
        taken.add(ids[0]!);
        plan.rows.push({ id: ids[0]!, seats: list.seatsCM! });
      }
    }
  }
  return plan;
}
