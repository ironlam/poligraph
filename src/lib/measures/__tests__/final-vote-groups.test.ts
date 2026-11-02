import { describe, expect, it } from "vitest";
import { chartGroups, isCandidateGroupAttested, isWholeTextVote } from "../final-vote-groups";

const row = (code: string, legislature: number | null, position: "POUR" | "CONTRE" = "POUR") => ({
  position,
  forCount: 10,
  againstCount: 2,
  abstainCount: 0,
  group: {
    id: code,
    code,
    name: `Groupe ${code}`,
    shortName: null,
    color: null,
    chamber: "AN" as const,
    legislature,
  },
});

describe("isWholeTextVote", () => {
  it("ne retient que le vote sur l'ensemble du texte", () => {
    expect(isWholeTextVote("L'ensemble du projet de loi de finances pour 2026")).toBe(true);
    expect(isWholeTextVote("L'ensemble de la proposition de loi visant à plafonner")).toBe(true);
    expect(isWholeTextVote("La première partie du projet de loi de finances")).toBe(false);
    expect(isWholeTextVote("La seconde partie du projet de loi de finances")).toBe(false);
  });
});

describe("chartGroups", () => {
  const scrutin = { chamber: "AN" as const, legislature: 17 };

  it("écarte les positions calculées dont le groupe n'est pas de la législature du scrutin", () => {
    const groups = chartGroups({
      scrutin,
      computed: [row("RN", 17), row("ANCIEN", 16), row("SANS", null)],
      official: null,
    });
    expect(groups.map((g) => g.code)).toEqual(["RN"]);
  });

  it("préfère le décompte officiel quand il est affiché", () => {
    const groups = chartGroups({
      scrutin,
      computed: [row("RN", 17)],
      official: {
        kind: "shown",
        rows: [
          {
            organeRef: "PO1",
            label: "Rassemblement National",
            abbreviation: "RN",
            memberCount: 120,
            forCount: 100,
            againstCount: 1,
            abstainCount: 0,
            nonVoterCount: 0,
            majorityPosition: "POUR",
          },
          {
            organeRef: "PO2",
            label: "Sans majorité",
            abbreviation: null,
            memberCount: 5,
            forCount: 2,
            againstCount: 2,
            abstainCount: 1,
            nonVoterCount: 0,
            majorityPosition: null,
          },
        ],
      },
    });
    expect(groups).toEqual([
      expect.objectContaining({ id: "PO1", code: "RN", name: "Rassemblement National", size: 120 }),
    ]);
  });

  it("retombe sur le calcul fiable quand le décompte officiel est masqué", () => {
    const groups = chartGroups({
      scrutin,
      computed: [row("RN", 17)],
      official: { kind: "not-imported" },
    });
    expect(groups.map((g) => g.code)).toEqual(["RN"]);
  });
});

describe("isCandidateGroupAttested", () => {
  it("exige un groupe de la même législature et de la même chambre", () => {
    const scrutin = { chamber: "AN" as const, legislature: 17 };
    expect(isCandidateGroupAttested(scrutin, { chamber: "AN", legislature: 17 })).toBe(true);
    expect(isCandidateGroupAttested(scrutin, { chamber: "AN", legislature: 16 })).toBe(false);
    expect(isCandidateGroupAttested(scrutin, { chamber: "AN", legislature: null })).toBe(false);
    expect(isCandidateGroupAttested(scrutin, { chamber: "SENAT", legislature: 17 })).toBe(false);
  });
});
