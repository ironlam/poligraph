// Règles de composition d'un gouvernement à une date (spec gouvernements §4).
// Seul endroit où une présence est décidée : pages, compteurs et exports passent par ici.
// Fonctions pures sur des dates `YYYY-MM-DD` : la comparaison de chaînes suit l'ordre calendaire.

import type {
  Category,
  Change,
  CompositionResult,
  DateEvidence,
  Episode,
  GovernmentDates,
  SameDayContext,
} from "./types";

const CATEGORIES: Category[] = ["established", "currentAffairs", "transition", "undocumented"];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Période consultable (règle 2) : de `formedAt` à `endedAt`, ou jusqu'à `compositionVerifiedAt`
 * pour un gouvernement en exercice. C'est une limite de consultation, pas une preuve de continuité.
 */
export function consultableRange(gov: GovernmentDates): { from: string; to: string } | null {
  if (!gov.formedAt) return null;
  const to = gov.endedAt ?? gov.compositionVerifiedAt;
  if (!to) return null;
  return { from: gov.formedAt, to };
}

/**
 * Entrées et sorties du jour D. L'appelant ne passe que les épisodes d'un seul gouvernement.
 * Une fin par cessation collective n'est pas une sortie : la personne reste présente
 * (affaires courantes), la composition ne change pas ce jour-là.
 */
export function buildSameDayContext(episodes: Episode[], date: string): SameDayContext {
  const entries = new Map<string, Episode>();
  const exits = new Map<string, Episode>();
  for (const ep of episodes) {
    if (ep.start === date) entries.set(ep.membershipId, ep);
    if (ep.end === date && ep.endKind !== "COLLECTIVE_RESIGNATION") exits.set(ep.membershipId, ep);
  }
  return { date, entries, exits };
}

/**
 * Règles 3, 5 et 6, sans tenir compte des autres changements du jour.
 *
 * Règle 6 (date DERIVED), version simple : une borne estimée ne décide rien le jour même.
 * Le jour du début estimé et le jour de la fin estimée sont `undocumented` ; les autres jours
 * suivent les règles ordinaires.
 */
function baseCategory(gov: GovernmentDates, ep: Episode, date: string): Category | null {
  if (date < ep.start) return null;
  // Une fonction ne survit pas à son gouvernement.
  if (gov.endedAt && date > gov.endedAt) return null;

  const derivedBound =
    (date === ep.start && ep.startEvidence === "DERIVED") ||
    (date === ep.end && ep.endEvidence === "DERIVED");

  if (ep.end !== null) {
    if (date <= ep.end) return derivedBound ? "undocumented" : "established";
    if (ep.endKind === "COLLECTIVE_RESIGNATION") {
      // Avec endedAt, les jours au-delà ont été écartés plus haut.
      if (gov.endedAt) return gov.resignedEvidence === "ACT" ? "currentAffairs" : "undocumented";
      // Successeur pas encore nommé : affaires courantes établies jusqu'à la composition vérifiée.
      const verified =
        gov.resignedEvidence === "ACT" &&
        gov.compositionVerifiedAt !== null &&
        date <= gov.compositionVerifiedAt;
      return verified ? "currentAffairs" : "undocumented";
    }
    return null;
  }

  // Fin inconnue : présence établie seulement jusqu'à la dernière confirmation de CETTE fonction.
  if (derivedBound) return "undocumented";
  if (ep.lastConfirmedAt !== null) {
    return date <= ep.lastConfirmedAt ? "established" : "undocumented";
  }
  // Sans confirmation, seul l'acte de nomination prouve la présence, et seulement le jour même.
  return date === ep.start && ep.startEvidence === "ACT" ? "established" : "undocumented";
}

/**
 * Catégorie d'une fonction au jour D, `null` si elle est absente.
 * `sameDay` doit être construit sur les épisodes du même gouvernement que `ep`.
 */
export function categoryAt(
  gov: GovernmentDates,
  ep: Episode,
  date: string,
  sameDay: SameDayContext
): Category | null {
  const isEntry = sameDay.entries.has(ep.membershipId);
  const isExit = sameDay.exits.has(ep.membershipId);

  // Règle 4 : seulement si le jour porte au moins une entrée ET au moins une sortie.
  // Le jour de formation sans sortie n'est donc jamais une transition.
  if ((isEntry || isExit) && sameDay.entries.size > 0 && sameDay.exits.size > 0) {
    // Successeur lié à une sortie du même jour.
    if (isEntry && ep.predecessorMembershipId && sameDay.exits.has(ep.predecessorMembershipId)) {
      if (!ep.sameDayOrderEstablished) return "transition";
      return baseCategory(gov, ep, date);
    }
    // Prédécesseur d'une entrée du même jour.
    if (isExit) {
      const successor = [...sameDay.entries.values()].find(
        (e) => e.predecessorMembershipId === ep.membershipId
      );
      if (successor) return successor.sameDayOrderEstablished ? null : "transition";
    }
    // Sans lien : changement indépendant seulement si sa propre date et toutes les dates du
    // sens opposé ce jour-là (fins des sorties pour une entrée, débuts des entrées pour une
    // sortie) sont des actes. Sinon le lien ne peut pas être exclu.
    const opposite: (DateEvidence | null)[] = [];
    if (isEntry) {
      for (const x of sameDay.exits.values()) {
        if (x.membershipId !== ep.membershipId) opposite.push(x.endEvidence);
      }
    }
    if (isExit) {
      for (const x of sameDay.entries.values()) {
        if (x.membershipId !== ep.membershipId) opposite.push(x.startEvidence);
      }
    }
    if (opposite.length > 0) {
      const own: (DateEvidence | null)[] = [];
      if (isEntry) own.push(ep.startEvidence);
      if (isExit) own.push(ep.endEvidence);
      if (![...own, ...opposite].every((e) => e === "ACT")) return "transition";
    }
  }

  return baseCategory(gov, ep, date);
}

export function compositionAt(
  gov: GovernmentDates,
  episodes: Episode[],
  date: string
): CompositionResult {
  if (!gov.formedAt) return { status: "not_established", reason: "no_formation_date" };
  if (gov.primeMinisterAppointedAt <= date && date < gov.formedAt) {
    return { status: "not_established", reason: "before_team" };
  }
  const range = consultableRange(gov);
  // formedAt est connu : un intervalle absent signifie un gouvernement en exercice non vérifié.
  if (!range) return { status: "not_established", reason: "not_verified" };
  if (date < range.from || date > range.to) return { status: "out_of_range", range };

  const own = episodes.filter((e) => e.governmentId === gov.id);
  const sameDay = buildSameDayContext(own, date);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Episode[]])) as Record<
    Category,
    Episode[]
  >;
  for (const ep of own) {
    const category = categoryAt(gov, ep, date, sameDay);
    if (category) byCategory[category].push(ep);
  }

  const persons = new Set(
    [...byCategory.established, ...byCategory.currentAffairs].map((e) => e.politicianId)
  );
  return {
    status: "ok",
    date,
    byCategory,
    establishedPersons: persons.size,
    caretaker: byCategory.currentAffairs.length > 0,
  };
}

/**
 * Mode « Fonctions exercées pendant la période » : `established` si l'intervalle établi
 * (règle 3) chevauche [from, to], `undocumented` si seul un intervalle non établi le chevauche.
 * La catégorie de base est constante entre deux bornes : on l'évalue à `from` et à chaque
 * borne de la fonction ou du gouvernement comprise dans la période.
 */
export function overlapsPeriod(
  gov: GovernmentDates,
  ep: Episode,
  from: string,
  to: string
): "established" | "undocumented" | null {
  const bounds = [ep.start, ep.end, ep.lastConfirmedAt, gov.endedAt].filter(
    (d): d is string => d !== null
  );
  const days = new Set<string>([from]);
  for (const b of bounds) {
    for (const d of [b, addDays(b, 1)]) if (d > from && d <= to) days.add(d);
  }

  let undocumented = false;
  for (const d of days) {
    const category = baseCategory(gov, ep, d);
    if (category === "established" || category === "currentAffairs") return "established";
    if (category !== null) undocumented = true;
  }
  return undocumented ? "undocumented" : null;
}

const EVIDENCE_RANK: Record<DateEvidence, number> = { ACT: 3, DATASET: 2, DERIVED: 1 };

// Preuve la plus faible d'un ensemble : un changement n'est jamais mieux prouvé que sa pire date.
function weakest(evidences: (DateEvidence | null)[]): DateEvidence | null {
  let result: DateEvidence | null = null;
  for (const e of evidences) {
    if (e === null) return null;
    if (result === null || EVIDENCE_RANK[e] < EVIDENCE_RANK[result]) result = e;
  }
  return result;
}

// Source commune : renvoyée seulement si toutes les dates du changement citent la même.
function commonSource(urls: (string | null)[]): string | null {
  const first = urls[0] ?? null;
  return urls.every((u) => u === first) ? first : null;
}

const KIND_ORDER: Record<Change["kind"], number> = {
  formation: 0,
  exit: 1,
  transition: 2,
  titleChange: 3,
  entry: 4,
  resignation: 5,
};

/**
 * Changements documentés (§4.3), dérivés des fonctions. La preuve d'un changement est la plus
 * faible des dates qui le composent : une date DATASET n'apparaît jamais comme ACT.
 * `GovernmentDates` ne porte pas les sources de formation et de démission : `sourceUrl` y vient
 * des fonctions (formation) ou reste null (démission), la page complète avec ses propres sources.
 */
export function documentedChanges(gov: GovernmentDates, episodes: Episode[]): Change[] {
  const own = episodes.filter((e) => e.governmentId === gov.id);
  const changes: Change[] = [];

  const dates = new Set<string>();
  for (const ep of own) {
    dates.add(ep.start);
    if (ep.end !== null && ep.endKind !== "COLLECTIVE_RESIGNATION") dates.add(ep.end);
  }

  for (const date of dates) {
    const sameDay = buildSameDayContext(own, date);
    const handled = new Set<string>();
    const touching = [...new Set([...sameDay.exits.values(), ...sameDay.entries.values()])];

    const transition = touching.filter((ep) => categoryAt(gov, ep, date, sameDay) === "transition");
    if (transition.length > 0) {
      const evidences = transition.flatMap((ep) => [
        ...(sameDay.entries.has(ep.membershipId) ? [ep.startEvidence] : []),
        ...(sameDay.exits.has(ep.membershipId) ? [ep.endEvidence] : []),
      ]);
      changes.push({
        date,
        kind: "transition",
        membershipIds: transition.map((e) => e.membershipId).sort(),
        evidence: weakest(evidences),
        sourceUrl: null,
      });
      transition.forEach((e) => handled.add(e.membershipId));
    }

    // Même personne, fin et début le même jour : changement de fonction.
    for (const entry of sameDay.entries.values()) {
      if (handled.has(entry.membershipId)) continue;
      const linked = entry.predecessorMembershipId
        ? sameDay.exits.get(entry.predecessorMembershipId)
        : undefined;
      const previous =
        linked && linked.politicianId === entry.politicianId
          ? linked
          : [...sameDay.exits.values()].find(
              (x) => x.politicianId === entry.politicianId && !handled.has(x.membershipId)
            );
      if (!previous || handled.has(previous.membershipId)) continue;
      changes.push({
        date,
        kind: "titleChange",
        membershipIds: [previous.membershipId, entry.membershipId],
        evidence: weakest([previous.endEvidence, entry.startEvidence]),
        sourceUrl:
          (previous === linked ? entry.sameDayOrderSourceUrl : null) ??
          commonSource([previous.endSourceUrl, entry.startSourceUrl]),
      });
      handled.add(previous.membershipId);
      handled.add(entry.membershipId);
    }

    const exits = [...sameDay.exits.values()].filter((e) => !handled.has(e.membershipId));
    for (const ep of exits) {
      changes.push({
        date,
        kind: "exit",
        membershipIds: [ep.membershipId],
        evidence: ep.endEvidence,
        sourceUrl: ep.endSourceUrl,
      });
    }

    const entries = [...sameDay.entries.values()].filter((e) => !handled.has(e.membershipId));
    if (entries.length === 0) continue;
    if (date === gov.formedAt) {
      changes.push({
        date,
        kind: "formation",
        membershipIds: entries.map((e) => e.membershipId).sort(),
        evidence: weakest(entries.map((e) => e.startEvidence)),
        sourceUrl: commonSource(entries.map((e) => e.startSourceUrl)),
      });
    } else {
      for (const ep of entries) {
        changes.push({
          date,
          kind: "entry",
          membershipIds: [ep.membershipId],
          evidence: ep.startEvidence,
          sourceUrl: ep.startSourceUrl,
        });
      }
    }
  }

  if (gov.resignedAt) {
    changes.push({
      date: gov.resignedAt,
      kind: "resignation",
      membershipIds: own
        .filter((e) => e.endKind === "COLLECTIVE_RESIGNATION")
        .map((e) => e.membershipId)
        .sort(),
      evidence: gov.resignedEvidence,
      sourceUrl: null,
    });
  }

  return changes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.membershipIds[0] ?? "").localeCompare(b.membershipIds[0] ?? "")
  );
}
