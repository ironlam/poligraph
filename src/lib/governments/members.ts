// Liste transversale des membres des gouvernements publiés (spec §6.4).
// Aucune présence n'est décidée ici : tout passe par `overlapsPeriod` et `compositionAt`.

import { presidencyOfGovernment } from "@/config/presidencies";
import { normalizeText } from "@/lib/name-matching";
import { matchesAffairsFilter, type MemberAffairsMap } from "./affairs";
import { addDays, compositionAt, consultableRange, overlapsPeriod } from "./composition";
import type { GovernmentEpisode, PersonCard } from "./mapping";
import type { MembersFunctionFilter, MembersQuery } from "./params";
import type { Category, Episode, FunctionType, GovernmentDates } from "./types";

export type MembersData = { episodes: GovernmentEpisode[]; people: Record<string, PersonCard> };

export type MemberFunction = { episode: GovernmentEpisode; status: Category };

export type MemberRow = {
  person: PersonCard;
  // established : au moins une fonction établie (ou en affaires courantes) ; transition (mode
  // « Présents au » seulement) : aucune établie, au moins une en transition ; sinon undocumented.
  status: "established" | "transition" | "undocumented";
  functions: MemberFunction[];
};

export type MembersResult =
  | {
      status: "ok";
      persons: MemberRow[];
      establishedCount: number;
      undocumentedCount: number;
      episodeCount: number;
    }
  | { status: "not_established" };

const FUNCTION_TYPE: Record<MembersFunctionFilter, FunctionType> = {
  pm: "PREMIER_MINISTRE",
  ministre: "MINISTRE",
  delegue: "MINISTRE_DELEGUE",
  secretaire: "SECRETAIRE_ETAT",
};

function normalizeSearch(text: string): string {
  return normalizeText(text).replace(/\s+/g, " ");
}

/** De la première formation à la dernière date consultable des gouvernements donnés. */
export function membersCoverage(govs: GovernmentDates[]): { from: string; to: string } | null {
  const ranges = govs
    .map(consultableRange)
    .filter((r): r is { from: string; to: string } => r !== null);
  if (ranges.length === 0) return null;
  return {
    from: ranges.map((r) => r.from).sort()[0]!,
    to: ranges
      .map((r) => r.to)
      .sort()
      .at(-1)!,
  };
}

/** Governments retained by the `gouvernement` and `presidence` filters (both apply). */
export function membersScope<G extends GovernmentDates>(
  govs: G[],
  query: Pick<MembersQuery, "gouvernement" | "presidence">
): G[] {
  return govs.filter(
    (g) =>
      (!query.gouvernement || g.slug === query.gouvernement) &&
      (!query.presidence || presidencyOfGovernment(g)?.slug === query.presidence)
  );
}

/**
 * Mode période, borné à la période consultable du gouvernement : la règle 3 seule pourrait
 * établir une présence au-delà de la composition documentée. Hors de cette période, une
 * fonction qui chevauche la recherche reste « à préciser », jamais établie.
 */
function periodCategory(
  gov: GovernmentDates,
  ep: Episode,
  du: string,
  au: string
): "established" | "undocumented" | null {
  const range = consultableRange(gov);
  const outside: [string, string][] = [];
  let inside: "established" | "undocumented" | null = null;
  if (range) {
    const from = du > range.from ? du : range.from;
    const to = au < range.to ? au : range.to;
    if (from <= to) inside = overlapsPeriod(gov, ep, from, to);
    if (du < range.from) outside.push([du, au < range.from ? au : addDays(range.from, -1)]);
    if (au > range.to) outside.push([du > range.to ? du : addDays(range.to, 1), au]);
  } else {
    outside.push([du, au]);
  }
  if (inside) return inside;
  return outside.some(([from, to]) => overlapsPeriod(gov, ep, from, to) !== null)
    ? "undocumented"
    : null;
}

/**
 * Personnes ayant exercé une fonction dans les gouvernements donnés (les gouvernements publiés),
 * selon le mode : chevauchement de la période [du, au], ou présence au jour `au`.
 * Les catégories sont calculées sur toutes les fonctions du gouvernement, personnes cachées
 * comprises (une sortie cachée reste une sortie pour la règle 4) ; les filtres viennent ensuite.
 * Les personnes cachées ne sont jamais listées. Liste triée par nom de famille normalisé.
 * `affairs` ne sert qu'au filtre `affaires` : sans entrée, une personne n'y passe pas.
 */
export function filterMembers(
  govs: GovernmentDates[],
  data: MembersData,
  query: MembersQuery,
  affairs: MemberAffairsMap = {}
): MembersResult {
  const scope = membersScope(govs, query);
  const byGov = new Map<string, GovernmentEpisode[]>(scope.map((g) => [g.id, []]));
  for (const ep of data.episodes) byGov.get(ep.governmentId)?.push(ep);

  const categorized: MemberFunction[] = [];
  if (query.mode === "periode") {
    for (const g of scope) {
      for (const ep of byGov.get(g.id) ?? []) {
        const status = periodCategory(g, ep, query.du, query.au);
        if (status) categorized.push({ episode: ep, status });
      }
    }
  } else {
    let consultable = false;
    for (const g of scope) {
      const own = byGov.get(g.id) ?? [];
      const result = compositionAt(g, own, query.au);
      if (result.status !== "ok") continue;
      consultable = true;
      // compositionAt renvoie les mêmes objets, typés `Episode` : on retrouve l'épisode enrichi.
      const byId = new Map(own.map((e) => [e.membershipId, e]));
      for (const [status, list] of Object.entries(result.byCategory) as [Category, Episode[]][]) {
        for (const { membershipId } of list) {
          const episode = byId.get(membershipId);
          if (episode) categorized.push({ episode, status });
        }
      }
    }
    if (!consultable) return { status: "not_established" };
  }

  const type = query.fonction ? FUNCTION_TYPE[query.fonction] : null;
  const needle = normalizeSearch(query.q);
  const rows = new Map<string, MemberRow>();
  for (const fn of categorized) {
    if (type && fn.episode.type !== type) continue;
    const person = data.people[fn.episode.politicianId];
    if (!person || person.visibility === "hidden") continue;
    if (query.personne !== null && person.slug !== query.personne) continue;
    if (query.affaires && !matchesAffairsFilter(affairs[person.id], query.affaires)) continue;
    if (needle) {
      const haystack = `${normalizeSearch(person.fullName)} ${normalizeSearch(person.slug)}`;
      if (!haystack.includes(needle)) continue;
    }
    const row = rows.get(person.id);
    if (row) row.functions.push(fn);
    else rows.set(person.id, { person, status: "undocumented", functions: [fn] });
  }

  let episodeCount = 0;
  for (const row of rows.values()) {
    row.functions.sort(
      (a, b) =>
        a.episode.start.localeCompare(b.episode.start) ||
        a.episode.membershipId.localeCompare(b.episode.membershipId)
    );
    const statuses = new Set(row.functions.map((f) => f.status));
    row.status =
      statuses.has("established") || statuses.has("currentAffairs")
        ? "established"
        : statuses.has("transition")
          ? "transition"
          : "undocumented";
    episodeCount += row.functions.length;
  }

  const sortKey = (row: MemberRow) =>
    `${normalizeSearch(row.person.lastName)}\u0000${normalizeSearch(row.person.fullName)}\u0000${row.person.id}`;
  const persons = [...rows.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return {
    status: "ok",
    persons,
    establishedCount: persons.filter((p) => p.status === "established").length,
    undocumentedCount: persons.filter((p) => p.status === "undocumented").length,
    episodeCount,
  };
}
