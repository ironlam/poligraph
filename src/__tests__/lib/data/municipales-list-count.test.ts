import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression guard for issue #871: "Sans liste" is a display bucket, not a list.
 *
 * Two definitions of "list" used to coexist. getCommune grouped candidacies by
 * `listName || "Sans liste"` and reported the bucket count, so a commune whose candidates
 * declared no list reported one list; every SQL path used COUNT(DISTINCT "listName"), which
 * skips NULL, and reported zero. Chatain (Vienne, 240 inhabitants) was the single commune in
 * production where the two disagreed.
 *
 * The rule settled on: only named lists count, because under 1000 inhabitants the ballot is
 * plurinominal and no list exists. The bucket must stay visible all the same, otherwise those
 * candidates disappear from the page behind "Aucune liste déposée".
 */

const communeFindUnique = vi.fn();
const electionFindUnique = vi.fn();
const candidacyFindMany = vi.fn();
const candidacyFindFirst = vi.fn();
const affairGroupBy = vi.fn();
const mandateFindFirst = vi.fn();
const communeElectionRoundFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    commune: { findUnique: (...a: unknown[]) => communeFindUnique(...a) },
    election: { findUnique: (...a: unknown[]) => electionFindUnique(...a) },
    candidacy: {
      findMany: (...a: unknown[]) => candidacyFindMany(...a),
      findFirst: (...a: unknown[]) => candidacyFindFirst(...a),
    },
    affair: { groupBy: (...a: unknown[]) => affairGroupBy(...a) },
    mandate: { findFirst: (...a: unknown[]) => mandateFindFirst(...a) },
    communeElectionRound: { findMany: (...a: unknown[]) => communeElectionRoundFindMany(...a) },
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// Import AFTER mocks
import { getCommune } from "@/lib/data/municipales";

/** A candidacy shaped the way getCommune's include clause returns one. */
function candidacy(listName: string | null, candidateName: string, listPosition: number) {
  return {
    id: `cand-${candidateName}`,
    listName,
    listPosition,
    candidateName,
    partyLabel: null,
    politicianId: null,
    politician: null,
    candidate: { id: `p-${candidateName}`, gender: "F" },
    round1Votes: null,
    round1Pct: null,
    round1Qualified: null,
    round2Votes: null,
    round2Pct: null,
    isElected: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  communeFindUnique.mockResolvedValue({
    id: "86063",
    name: "Chatain",
    departmentCode: "86",
    population: 240,
  });
  electionFindUnique.mockResolvedValue({
    id: "elec-2026",
    round1Date: new Date("2026-03-15"),
    round2Date: null,
  });
  affairGroupBy.mockResolvedValue([]);
  mandateFindFirst.mockResolvedValue(null);
  candidacyFindFirst.mockResolvedValue(null);
  communeElectionRoundFindMany.mockResolvedValue([]);
});

describe("getCommune, décompte des listes", () => {
  it("ne compte aucune liste quand aucun nom de liste n'est déclaré", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy(null, "Odile DECELLE", 1),
      candidacy(null, "Bruno BOURGOIN", 2),
      candidacy(null, "Eliane BRUNET", 3),
    ]);

    const commune = await getCommune("86063");

    expect(commune?.stats.listCount).toBe(0);
    expect(commune?.stats.candidateCount).toBe(3);
  });

  it("affiche quand même ces candidats, sous un groupe « Sans liste »", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy(null, "Odile DECELLE", 1),
      candidacy(null, "Bruno BOURGOIN", 2),
      candidacy(null, "Eliane BRUNET", 3),
    ]);

    const commune = await getCommune("86063");

    // Le décompte tombe à zéro, la page ne doit pas se vider pour autant.
    expect(commune?.lists).toHaveLength(1);
    expect(commune?.lists[0]?.name).toBe("Sans liste");
    expect(commune?.lists[0]?.candidateCount).toBe(3);
  });

  it("ne compte que les listes nommées quand les deux cas coexistent", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy("BROIN PLUS LOIN", "A", 1),
      candidacy("BROIN PLUS LOIN", "B", 2),
      candidacy("ENSEMBLE POUR BROIN", "C", 1),
      candidacy(null, "D", 1),
    ]);

    const commune = await getCommune("86063");

    expect(commune?.stats.listCount).toBe(2);
    // Trois groupes affichés, deux listes comptées : l'écart est voulu.
    expect(commune?.lists).toHaveLength(3);
  });

  it("compte chaque liste une fois, quel que soit le nombre de colistiers", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy("SAIL TOUS ENSEMBLE", "A", 1),
      candidacy("SAIL TOUS ENSEMBLE", "B", 2),
      candidacy("SAIL TOUS ENSEMBLE", "C", 3),
    ]);

    const commune = await getCommune("86063");

    expect(commune?.stats.listCount).toBe(1);
    expect(commune?.stats.candidateCount).toBe(3);
  });
});
