import { describe, expect, it } from "vitest";

import {
  parseOfficialGroupCount,
  parseOfficialGroupCounts,
  parseOfficialGroupCountsDetailed,
  serializeOfficialGroupCounts,
  serializeOfficialGroupSnapshot,
} from "./official-group-counts";

describe("parseOfficialGroupCount", () => {
  it("keeps the official group reference and all source totals", () => {
    const result = parseOfficialGroupCount({
      organeRef: "PO845401",
      nombreMembresGroupe: "125",
      vote: {
        positionMajoritaire: "pour",
        decompteVoix: {
          pour: "72",
          contre: "4",
          abstentions: "3",
          nonVotants: "46",
          nonVotantsVolontaires: "2",
        },
      },
    });

    expect(result).toEqual({
      sourceIndex: 0,
      organeRef: "PO845401",
      memberCount: 125,
      forCount: 72,
      againstCount: 4,
      abstainCount: 3,
      nonVoterCount: 46,
      voluntaryNonVoterCount: 2,
      majorityPosition: "POUR",
      issues: [],
    });
  });

  it("does not turn null or malformed source values into zero", () => {
    const result = parseOfficialGroupCount({
      organeRef: "PO845401",
      nombreMembresGroupe: "125",
      vote: {
        positionMajoritaire: "inconnu",
        decompteVoix: {
          pour: "0",
          contre: null,
          abstentions: "not-a-number",
          nonVotants: "",
          nonVotantsVolontaires: -1,
        },
      },
    });

    expect(result.forCount).toBe(0);
    expect(result.againstCount).toBeNull();
    expect(result.abstainCount).toBeNull();
    expect(result.nonVoterCount).toBeNull();
    expect(result.voluntaryNonVoterCount).toBeNull();
    expect(result.majorityPosition).toBeNull();
    expect(result.issues).toHaveLength(5);
  });

  it("reports a malformed group without throwing", () => {
    const result = parseOfficialGroupCount(null);

    expect(result.organeRef).toBeNull();
    expect(result.memberCount).toBeNull();
    expect(result.forCount).toBeNull();
    expect(result.issues).toContain("organeRef: valeur absente");
    expect(result.issues).toContain("decompteVoix: objet absent");
  });
});

describe("parseOfficialGroupCounts", () => {
  it("accepts the AN wrapper and a singleton group", () => {
    const result = parseOfficialGroupCounts({
      scrutin: {
        ventilationVotes: {
          organe: {
            groupes: {
              groupe: {
                organeRef: "PO845407",
                nombreMembresGroupe: "95",
                vote: {
                  positionMajoritaire: "contre",
                  decompteVoix: {
                    pour: "0",
                    contre: "56",
                    abstentions: "0",
                    nonVotants: "39",
                    nonVotantsVolontaires: "0",
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.organeRef).toBe("PO845407");
    expect(result[0]?.againstCount).toBe(56);
    expect(result[0]?.majorityPosition).toBe("CONTRE");
  });

  it("distinguishes an absent group list from an official empty list", () => {
    const absent = parseOfficialGroupCountsDetailed({
      scrutin: { ventilationVotes: { organe: { groupes: {} } } },
    });
    const empty = parseOfficialGroupCountsDetailed({
      scrutin: { ventilationVotes: { organe: { groupes: { groupe: [] } } } },
    });

    expect(absent.counts).toEqual([]);
    expect(absent.issues).toContain("ventilationVotes.organe.groupes.groupe: liste absente");
    expect(empty).toEqual({ counts: [], issues: [] });
  });

  it("preserves duplicate organeRef blocks with their source index", () => {
    const result = parseOfficialGroupCountsDetailed({
      scrutin: {
        ventilationVotes: {
          organe: {
            groupes: {
              groupe: [
                {
                  organeRef: "PO0",
                  nombreMembresGroupe: "2",
                  vote: {
                    positionMajoritaire: "pour",
                    decompteVoix: {
                      pour: "2",
                      contre: "0",
                      abstentions: "0",
                      nonVotants: "0",
                    },
                  },
                },
                {
                  organeRef: "PO0",
                  nombreMembresGroupe: "3",
                  vote: {
                    positionMajoritaire: "contre",
                    decompteVoix: {
                      pour: "0",
                      contre: "3",
                      abstentions: "0",
                      nonVotants: "0",
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });

    expect(result.counts).toHaveLength(2);
    expect(result.counts.map((count) => count.sourceIndex)).toEqual([0, 1]);
    expect(result.counts[1]?.issues).toContain("organeRef: doublon à l'index 1");
  });
});

describe("serializeOfficialGroupCounts", () => {
  it("is independent of diagnostic insertion order", () => {
    const base = parseOfficialGroupCount({
      organeRef: "PO845401",
      nombreMembresGroupe: "1",
      vote: {
        positionMajoritaire: "abstention",
        decompteVoix: {
          pour: "0",
          contre: "0",
          abstentions: "1",
          nonVotants: "0",
          nonVotantsVolontaires: "0",
        },
      },
    });
    const reordered = {
      ...base,
      issues: ["z-diagnostic", "a-diagnostic"],
    };
    const differentlyOrdered = {
      ...base,
      issues: ["a-diagnostic", "z-diagnostic"],
    };

    expect(serializeOfficialGroupCounts([reordered])).toBe(
      serializeOfficialGroupCounts([differentlyOrdered])
    );
  });

  it("does not depend on the source order of groups", () => {
    const first = parseOfficialGroupCount({
      organeRef: "PO845407",
      nombreMembresGroupe: "1",
      vote: {
        positionMajoritaire: "contre",
        decompteVoix: { pour: "0", contre: "1", abstentions: "0", nonVotants: "0" },
      },
    });
    const second = parseOfficialGroupCount({
      organeRef: "PO845401",
      nombreMembresGroupe: "1",
      vote: {
        positionMajoritaire: "pour",
        decompteVoix: { pour: "1", contre: "0", abstentions: "0", nonVotants: "0" },
      },
    });

    expect(serializeOfficialGroupCounts([first, second])).toBe(
      serializeOfficialGroupCounts([second, first])
    );
    expect(serializeOfficialGroupSnapshot([first], ["z", "a"])).toBe(
      serializeOfficialGroupSnapshot([first], ["a", "z"])
    );
  });
});
