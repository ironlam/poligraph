import { describe, it, expect } from "vitest";
import { deriveCandidacyNoticeState } from "@/lib/politicians/candidacy-notice-state";
import type { PoliticianCandidacy } from "@/lib/data/politician-candidacy";

const BEFORE = new Date("2026-08-07T10:00:00.000Z");
const AFTER = new Date("2027-05-10T10:00:00.000Z");

const base: PoliticianCandidacy = {
  candidacyId: "cand-1",
  electionSlug: "presidentielle-2027",
  electionShortTitle: "Présidentielle 2027",
  round1Date: new Date("2027-04-11T00:00:00.000Z"),
  round2Date: new Date("2027-04-25T00:00:00.000Z"),
  status: "DECLARE",
  sourceUrl: "https://example.org/source",
  sourceLabel: "Le Monde, 14 janvier 2026",
  partyLabel: null,
  partyLogoUrl: null,
  partyColor: null,
  programmeIdentified: false,
  declaredAt: new Date("2026-01-14T00:00:00.000Z"),
  withdrewAt: null,
  synthesis: null,
  synthesisGeneratedAt: null,
  publishedMeasureCount: 0,
  themesCoveredCount: 0,
  primarySourceMeasureCount: 0,
  lastReviewedAt: null,
  round1Pct: null,
  round2Pct: null,
  isElected: false,
};

describe("deriveCandidacyNoticeState", () => {
  it("rend DECLARED_EMPTY quand rien n'est publié : l'état du lancement", () => {
    expect(deriveCandidacyNoticeState(base, BEFORE).kind).toBe("DECLARED_EMPTY");
  });

  it("rend DECLARED_WITH_MEASURES quand la fiche franchit son seuil", () => {
    const state = deriveCandidacyNoticeState(
      {
        ...base,
        publishedMeasureCount: 27,
        themesCoveredCount: 9,
        primarySourceMeasureCount: 20,
        lastReviewedAt: new Date("2026-08-02T00:00:00.000Z"),
      },
      BEFORE
    );
    expect(state.kind).toBe("DECLARED_WITH_MEASURES");
  });

  it("reste DECLARED_EMPTY quand les mesures existent sans source primaire", () => {
    const state = deriveCandidacyNoticeState(
      { ...base, publishedMeasureCount: 12, themesCoveredCount: 4, primarySourceMeasureCount: 0 },
      BEFORE
    );
    expect(state.kind).toBe("DECLARED_EMPTY");
  });

  it("rend POSSIBLE pour une candidature pressentie", () => {
    expect(deriveCandidacyNoticeState({ ...base, status: "PRESSENTI" }, BEFORE).kind).toBe(
      "POSSIBLE"
    );
  });

  it("rend POSSIBLE pour une candidature évoquée", () => {
    expect(deriveCandidacyNoticeState({ ...base, status: "ENVISAGE" }, BEFORE).kind).toBe(
      "POSSIBLE"
    );
  });

  it("rend WITHDRAWN pour une candidature retirée, même avec des mesures publiées", () => {
    const state = deriveCandidacyNoticeState(
      {
        ...base,
        status: "RETIRE",
        withdrewAt: new Date("2027-03-03T00:00:00.000Z"),
        publishedMeasureCount: 18,
        primarySourceMeasureCount: 15,
      },
      BEFORE
    );
    expect(state.kind).toBe("WITHDRAWN");
  });

  it("garde WITHDRAWN après le scrutin : un retrait ne devient pas une participation", () => {
    const state = deriveCandidacyNoticeState(
      { ...base, status: "RETIRE", withdrewAt: new Date("2027-03-03T00:00:00.000Z") },
      AFTER
    );
    expect(state.kind).toBe("WITHDRAWN");
  });

  it("garde POSSIBLE après le scrutin : une mention de presse ne devient pas une candidature", () => {
    expect(deriveCandidacyNoticeState({ ...base, status: "PRESSENTI" }, AFTER).kind).toBe(
      "POSSIBLE"
    );
  });

  it("rend PAST avec ses résultats après le scrutin", () => {
    const state = deriveCandidacyNoticeState({ ...base, round1Pct: 27.4, round2Pct: 47.2 }, AFTER);
    expect(state.kind).toBe("PAST");
    if (state.kind !== "PAST") throw new Error("état inattendu");
    expect(state.results).toEqual({ round1Pct: 27.4, round2Pct: 47.2, isElected: false });
  });

  it("rend PAST sans bloc de résultats quand aucun score n'est enregistré", () => {
    const state = deriveCandidacyNoticeState(base, AFTER);
    expect(state.kind).toBe("PAST");
    if (state.kind !== "PAST") throw new Error("état inattendu");
    // No score in the database means either "never on the ballot" or "results not imported yet",
    // and nothing distinguishes the two. Omitting the block asserts neither.
    expect(state.results).toBeNull();
  });

  it("bascule en PAST à 20:00 Paris le jour du second tour, pas à minuit", () => {
    expect(deriveCandidacyNoticeState(base, new Date("2027-04-25T17:59:00.000Z")).kind).toBe(
      "DECLARED_EMPTY"
    );
    expect(deriveCandidacyNoticeState(base, new Date("2027-04-25T18:01:00.000Z")).kind).toBe(
      "PAST"
    );
  });

  it("mesure la fin du scrutin sur le premier tour quand il n'y a pas de second", () => {
    const state = deriveCandidacyNoticeState(
      { ...base, round2Date: null },
      new Date("2027-04-11T18:01:00.000Z")
    );
    expect(state.kind).toBe("PAST");
  });

  it("ne devient jamais PAST quand l'élection n'a pas de date", () => {
    const state = deriveCandidacyNoticeState(
      { ...base, round1Date: null, round2Date: null },
      AFTER
    );
    expect(state.kind).toBe("DECLARED_EMPTY");
  });
});
