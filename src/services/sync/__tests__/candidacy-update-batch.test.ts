import { describe, expect, it } from "vitest";
import {
  buildCandidacyUpdateBatch,
  dedupeCandidacyUpdates,
  type CandidacyUpdateRow,
} from "../candidacy-update-batch";

function row(id: string, partyLabel: string | null = null): CandidacyUpdateRow {
  return {
    id,
    politicianId: null,
    partyId: null,
    partyLabel,
    listName: null,
    listPosition: null,
    constituencyName: null,
    candidateId: null,
    communeId: null,
  };
}

describe("dedupeCandidacyUpdates", () => {
  it("garde la dernière valeur pour un identifiant répété", () => {
    // The sequential loop it replaces applied updates in order, so the last write won.
    // UPDATE ... FROM (VALUES ...) picks an arbitrary source row, hence this pre-pass.
    const result = dedupeCandidacyUpdates([row("a", "LR"), row("b", "PS"), row("a", "RN")]);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === "a")?.partyLabel).toBe("RN");
  });

  it("préserve l'ordre de première apparition", () => {
    const result = dedupeCandidacyUpdates([row("b", "PS"), row("a", "LR"), row("b", "EELV")]);

    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("rend un tableau vide pour une entrée vide", () => {
    expect(dedupeCandidacyUpdates([])).toEqual([]);
  });
});

describe("buildCandidacyUpdateBatch", () => {
  it("rend null sur un lot vide plutôt qu'un UPDATE sans cible", () => {
    expect(buildCandidacyUpdateBatch([], new Date())).toBeNull();
  });

  it("dédoublonne avant de construire, donc une seule ligne de VALUES", () => {
    const batch = buildCandidacyUpdateBatch([row("a", "LR"), row("a", "RN")], new Date());

    expect(batch).not.toBeNull();
    // 9 columns + the updatedAt parameter, for one deduplicated row.
    expect(batch!.sql.values).toHaveLength(10);
    expect(batch!.sql.values).toContain("RN");
    expect(batch!.sql.values).not.toContain("LR");
  });

  it("rend le nombre de cibles, pas le nombre d'entrées", () => {
    // This is what stops the caller from reading a legitimate duplicate as a missing row.
    const batch = buildCandidacyUpdateBatch([row("a"), row("b"), row("a")], new Date());

    expect(batch!.targets).toBe(2);
  });

  it("porte les casts dans le SET, pas dans le VALUES", () => {
    // The pg adapter rejects some casts written inside a VALUES list, and an all-null column
    // would otherwise be inferred as text and fail on assignment to an integer column.
    const text = buildCandidacyUpdateBatch([row("a")], new Date())!.sql.sql;

    expect(text).toContain('"listPosition"     = v."listPosition"::int');
    expect(text).not.toMatch(/VALUES[^)]*::/);
  });
});
