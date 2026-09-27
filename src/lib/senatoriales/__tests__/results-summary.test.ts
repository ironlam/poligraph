import { describe, expect, it } from "vitest";
import { summariseResults, type ElectedRow } from "../results-summary";

const row = (over: Partial<ElectedRow> = {}): ElectedRow => ({
  candidateName: "Jeanne EXEMPLE",
  constituencyCode: "01",
  constituencyName: "Ain",
  partyLabel: "Liste divers droite",
  round2Votes: null,
  politicianId: null,
  politicianSlug: null,
  gender: "F",
  updatedAt: new Date("2026-09-27T20:00:00Z"),
  ...over,
});

describe("summariseResults", () => {
  it("classe un élu rattaché à un sortant comme réélu", () => {
    const s = summariseResults([row({ politicianId: "p1" })], new Set(["p1"]));
    expect(s.elected[0]?.status).toBe("reelected");
    expect(s).toMatchObject({ reelected: 1, newcomers: 0, unresolved: 0 });
  });

  it("classe un élu rattaché hors snapshot comme nouveau", () => {
    const s = summariseResults([row({ politicianId: "p2" })], new Set(["p1"]));
    expect(s.elected[0]?.status).toBe("newcomer");
    expect(s.newcomers).toBe(1);
  });

  it("ne compte un non-rattaché ni comme réélu ni comme nouveau", () => {
    const s = summariseResults([row()], new Set(["p1"]));
    expect(s.elected[0]?.status).toBe("unresolved");
    expect(s).toMatchObject({ reelected: 0, newcomers: 0, unresolved: 1 });
  });

  it("calcule la part de femmes", () => {
    const s = summariseResults(
      [row({ gender: "F" }), row({ gender: "F" }), row({ gender: "M" })],
      new Set()
    );
    expect(s.womenShare).toBeCloseTo(2 / 3);
  });

  it("refuse la part de femmes quand un genre manque", () => {
    const s = summariseResults([row({ gender: "F" }), row({ gender: null })], new Set());
    expect(s.womenShare).toBeNull();
  });

  it("compte les circonscriptions distinctes et trie par code puis nom", () => {
    const s = summariseResults(
      [
        row({ constituencyCode: "08", candidateName: "Marc LAMÉNIE", round2Votes: 500 }),
        row({ constituencyCode: "01", candidateName: "Zoé B" }),
        row({ constituencyCode: "01", candidateName: "Anne A" }),
      ],
      new Set()
    );
    expect(s.proclaimedConstituencies).toBe(2);
    expect(s.seatsFilled).toBe(3);
    expect(s.elected.map((e) => e.name)).toEqual(["Anne A", "Zoé B", "Marc LAMÉNIE"]);
    expect(s.elected[2]?.round).toBe(2);
  });

  it("trie les codes d'outre-mer et ZZ après la métropole", () => {
    const s = summariseResults(
      [
        row({ constituencyCode: "ZZ" }),
        row({ constituencyCode: "977" }),
        row({ constituencyCode: "2A" }),
        row({ constituencyCode: "09" }),
      ],
      new Set()
    );
    expect(s.elected.map((e) => e.constituencyCode)).toEqual(["09", "2A", "977", "ZZ"]);
  });

  it("date la dernière importation, et rien sans résultat", () => {
    const later = new Date("2026-09-27T21:00:00Z");
    expect(summariseResults([row(), row({ updatedAt: later })], new Set()).lastImportedAt).toEqual(
      later
    );
    expect(summariseResults([], new Set())).toMatchObject({
      lastImportedAt: null,
      womenShare: null,
      seatsFilled: 0,
    });
  });
});
