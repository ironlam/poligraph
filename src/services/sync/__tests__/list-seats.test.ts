import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { matchListCandidacies, planSeatWrites } from "../list-seats";
import type { CommuneResult2026, ListResult2026 } from "../parse-wide-results-2026";

function list(listName: string, seatsCM: number | null, listShortName = ""): ListResult2026 {
  return { listName, listShortName, seatsCM } as ListResult2026;
}

function commune(inseeCode: string, lists: ListResult2026[]): CommuneResult2026 {
  return { inseeCode, lists } as CommuneResult2026;
}

const head = (id: string, communeId: string, listName: string | null) => ({
  id,
  communeId,
  listName,
});

describe("matchListCandidacies", () => {
  const candidacies = [
    { id: "a", listName: "Rennes à Gauche" },
    { id: "b", listName: "RENNES POUR TOUS" },
    { id: "c", listName: null },
  ];

  it("rapproche sur le nom normalisé, sans accents ni casse", () => {
    expect(matchListCandidacies(candidacies, list("RENNES A GAUCHE", 1))).toEqual({
      ids: ["a"],
      partial: false,
    });
  });

  it("se rabat sur le libellé abrégé", () => {
    expect(matchListCandidacies(candidacies, list("Autre nom", 1, "Rennes pour tous")).ids).toEqual(
      ["b"]
    );
  });

  it("signale un rapprochement par mots-clés", () => {
    expect(matchListCandidacies(candidacies, list("Rennes Gauche unie", 1))).toEqual({
      ids: [],
      partial: false,
    });
    expect(matchListCandidacies(candidacies, list("Gauche Rennes", 1))).toEqual({
      ids: ["a"],
      partial: true,
    });
  });
});

describe("planSeatWrites", () => {
  const heads = [
    head("h1", "35238", "Liste A"),
    head("h2", "35238", "Liste B"),
    head("h3", "01160", "Liste A"),
  ];

  it("écrit une ligne par liste, sur la tête de liste de la bonne commune", () => {
    const plan = planSeatWrites(
      [commune("35238", [list("Liste A", 44), list("Liste B", 0)])],
      heads
    );
    expect(plan.rows).toEqual([
      { id: "h1", seats: 44 },
      { id: "h2", seats: 0 },
    ]);
    expect(plan).toMatchObject({ communes: 1, lists: 2, seats: 44, skipped: [] });
  });

  it("n'écrit rien pour une liste sans sièges publiés ni pour une commune absente de la base", () => {
    const plan = planSeatWrites(
      [commune("35238", [list("Liste A", null)]), commune("99999", [list("Liste A", 3)])],
      heads
    );
    expect(plan.rows).toEqual([]);
    expect(plan.communes).toBe(0);
  });

  it("laisse de côté une liste sans tête de liste, ou dont la tête est déjà prise", () => {
    const plan = planSeatWrites(
      [commune("35238", [list("Liste A", 10), list("Union", 5), list("LISTE A", 7)])],
      heads
    );
    expect(plan.rows).toEqual([{ id: "h1", seats: 10 }]);
    expect(plan.skipped).toEqual([
      'no match: "Union" in 35238',
      'head already taken: "LISTE A" in 35238',
    ]);
  });

  // Second round: a merged list carries a new name sharing its words with a first-round list.
  it("refuse un rapprochement par mots-clés, qui poserait les sièges sur une autre liste", () => {
    const plan = planSeatWrites(
      [
        commune("35238", [
          list("Ensemble pour notre ville demain", 30),
          list("Ensemble pour notre ville", 5),
        ]),
      ],
      [head("h1", "35238", "ENSEMBLE POUR NOTRE VILLE")]
    );
    expect(plan.rows).toEqual([{ id: "h1", seats: 5 }]);
    expect(plan.skipped).toEqual(['no match: "Ensemble pour notre ville demain" in 35238']);
  });

  it("laisse de côté une liste que plusieurs têtes de liste rapprochent", () => {
    const plan = planSeatWrites(
      [commune("75056", [list("Paris", 9)])],
      [head("p1", "75056", "Paris"), head("p2", "75056", "PARIS")]
    );
    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual(['2 heads match: "Paris" in 75056']);
  });
});
