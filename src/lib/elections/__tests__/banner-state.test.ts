import { describe, it, expect } from "vitest";
import { deriveElectionBannerState, type ElectionRoundScore } from "@/lib/elections/banner-state";

// 2027 round dates as stored by the importer: midnight UTC on the polling day.
const ROUND1 = new Date("2027-04-11T00:00:00.000Z");
const ROUND2 = new Date("2027-04-25T00:00:00.000Z");

const SCORES: ElectionRoundScore[] = [
  {
    candidateName: "Camille Rivière",
    politicianSlug: "camille-riviere",
    partyLabel: "UD",
    pct: 27.4,
  },
  { candidateName: "Jean Vasseur", politicianSlug: "jean-vasseur", partyLabel: "AC", pct: 23.1 },
];

function derive(
  now: string,
  overrides: Partial<Parameters<typeof deriveElectionBannerState>[0]> = {}
) {
  return deriveElectionBannerState({
    round1Date: ROUND1,
    round2Date: ROUND2,
    now: new Date(now),
    round1Scores: [],
    winner: null,
    ...overrides,
  });
}

describe("deriveElectionBannerState", () => {
  it("rend null quand l'élection n'a pas de date de premier tour", () => {
    expect(derive("2026-08-07T10:00:00.000Z", { round1Date: null })).toBeNull();
  });

  it("rend FAR à plus de 30 jours du premier tour", () => {
    const state = derive("2027-03-01T10:00:00.000Z");
    expect(state).toMatchObject({ kind: "FAR", showSeconds: false });
  });

  it("rend LAST_MONTH à 29 jours du premier tour", () => {
    const state = derive("2027-03-14T10:00:00.000Z");
    expect(state).toMatchObject({ kind: "LAST_MONTH", showSeconds: false });
  });

  it("bascule de FAR à LAST_MONTH sur la borne des 30 jours", () => {
    // 2027-04-11 08:00 Paris is 2027-04-11T06:00Z. 30 days earlier: 2027-03-12T06:00Z.
    expect(derive("2027-03-12T05:59:00.000Z")).toMatchObject({ kind: "FAR" });
    expect(derive("2027-03-12T06:01:00.000Z")).toMatchObject({ kind: "LAST_MONTH" });
  });

  it("vise 08:00 Paris le jour du scrutin, pas minuit UTC", () => {
    const state = derive("2027-03-01T10:00:00.000Z");
    // April is CEST (UTC+2), so 08:00 Paris is 06:00Z.
    if (state?.kind !== "FAR") throw new Error("état inattendu");
    expect(state.targetDate.toISOString()).toBe("2027-04-11T06:00:00.000Z");
  });

  it("rend VOTING_DAY avec les secondes à 19:59 Paris le jour du premier tour", () => {
    const state = derive("2027-04-11T17:59:00.000Z");
    expect(state).toMatchObject({ kind: "VOTING_DAY", showSeconds: true, round: 1 });
    if (state?.kind !== "VOTING_DAY") throw new Error("état inattendu");
    expect(state.targetDate.toISOString()).toBe("2027-04-11T18:00:00.000Z");
  });

  it("bascule en BETWEEN_ROUNDS à 20:01 Paris le jour du premier tour", () => {
    const state = derive("2027-04-11T18:01:00.000Z");
    expect(state).toMatchObject({ kind: "BETWEEN_ROUNDS", showSeconds: false });
    if (state?.kind !== "BETWEEN_ROUNDS") throw new Error("état inattendu");
    expect(state.targetDate.toISOString()).toBe("2027-04-25T06:00:00.000Z");
  });

  it("laisse BETWEEN_ROUNDS sans scores quand ils ne sont pas encore importés", () => {
    const state = derive("2027-04-11T18:01:00.000Z");
    if (state?.kind !== "BETWEEN_ROUNDS") throw new Error("état inattendu");
    expect(state.round1Scores).toEqual([]);
  });

  it("porte les scores du premier tour en BETWEEN_ROUNDS quand ils existent", () => {
    const state = derive("2027-04-14T10:00:00.000Z", { round1Scores: SCORES });
    if (state?.kind !== "BETWEEN_ROUNDS") throw new Error("état inattendu");
    expect(state.round1Scores).toHaveLength(2);
  });

  it("rend VOTING_DAY le jour du second tour", () => {
    const state = derive("2027-04-25T17:59:00.000Z");
    expect(state).toMatchObject({ kind: "VOTING_DAY", showSeconds: true, round: 2 });
  });

  it("bascule en AFTER à 20:01 Paris le jour du second tour", () => {
    expect(derive("2027-04-25T18:01:00.000Z")).toMatchObject({ kind: "AFTER" });
  });

  it("porte le vainqueur en AFTER quand il est connu", () => {
    const winner: ElectionRoundScore = {
      candidateName: "Camille Rivière",
      politicianSlug: "camille-riviere",
      partyLabel: "UD",
      pct: 52.8,
    };
    const state = derive("2027-05-02T10:00:00.000Z", { winner });
    if (state?.kind !== "AFTER") throw new Error("état inattendu");
    expect(state.winner?.pct).toBe(52.8);
  });

  it("ne rend jamais de date cible en AFTER", () => {
    const state = derive("2027-05-02T10:00:00.000Z");
    if (state?.kind !== "AFTER") throw new Error("état inattendu");
    expect(state).not.toHaveProperty("targetDate");
  });

  it("passe de VOTING_DAY à AFTER sans BETWEEN_ROUNDS quand il n'y a qu'un tour", () => {
    expect(derive("2027-04-11T17:59:00.000Z", { round2Date: null })).toMatchObject({
      kind: "VOTING_DAY",
      round: 1,
    });
    expect(derive("2027-04-11T18:01:00.000Z", { round2Date: null })).toMatchObject({
      kind: "AFTER",
    });
  });

  it("lit le décalage horaire de la zone au lieu de le supposer (scrutin de mars, CET)", () => {
    // A March round is CET (UTC+1), so 08:00 Paris is 07:00Z, not 06:00Z. A hardcoded +2 offset
    // would make this assertion fail, which is the point of the test.
    const march = new Date("2027-03-14T00:00:00.000Z");
    const state = deriveElectionBannerState({
      round1Date: march,
      round2Date: null,
      now: new Date("2027-02-01T10:00:00.000Z"),
      round1Scores: [],
      winner: null,
    });
    if (state?.kind !== "FAR") throw new Error("état inattendu");
    expect(state.targetDate.toISOString()).toBe("2027-03-14T07:00:00.000Z");
  });
});
