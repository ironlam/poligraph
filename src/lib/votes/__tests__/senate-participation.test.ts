import { describe, expect, it } from "vitest";
import {
  aggregateSenateParticipation,
  assessSenateVoteSource,
  computeSenateParticipationCandidate,
  mapSenateVotePosition,
  type SenateSourceVote,
} from "@/lib/votes/senate-participation";

const votes: SenateSourceVote[] = [
  { matricule: "A", vote: "p", siege: 1 },
  { matricule: "B", vote: "c", siege: 2 },
  { matricule: "C", vote: "a", siege: 3 },
  { matricule: "D", vote: "n", siege: 4 },
];

const official = {
  voters: 3,
  nonVoters: 1,
  votesFor: 1,
  votesAgainst: 1,
  votesAbstain: 1,
};

describe("source nominative des scrutins publics du Sénat", () => {
  it("valide la liste complète par rapport aux totaux officiels", () => {
    expect(assessSenateVoteSource(votes, official)).toEqual({
      status: "COMPLETE",
      expectedCount: 4,
      observedCount: 4,
      reason: null,
    });
  });

  it("refuse tout code inconnu au lieu de le convertir en ABSENT", () => {
    expect(assessSenateVoteSource([{ ...votes[0]!, vote: "x" }], official)).toMatchObject({
      status: "INVALID",
      reason: "unknown_vote_code:x",
    });
    expect(() => mapSenateVotePosition("x")).toThrow("Code de vote Sénat inconnu");
  });

  it("refuse une ligne JSON mal formée", () => {
    const malformed = [{ ...votes[0]!, matricule: "" }, ...votes.slice(1)];
    expect(assessSenateVoteSource(malformed, official)).toMatchObject({
      status: "INVALID",
      reason: "vote_row_invalid",
    });
  });

  it.each([
    [[...votes.slice(0, 3)], "row_count_mismatch"],
    [[...votes, { matricule: "A", vote: "p", siege: 5 }], "duplicate_identity"],
    [[...votes, { matricule: "E", vote: "p", siege: 4 }], "duplicate_identity"],
  ] as const)("neutralise une liste incomplète ou ambiguë", (sourceVotes, reason) => {
    expect(assessSenateVoteSource([...sourceVotes], official)).toMatchObject({ reason });
  });

  it("contrôle aussi la parité de chaque position avec la page officielle", () => {
    expect(assessSenateVoteSource(votes, { ...official, votesFor: 2 })).toMatchObject({
      status: "INCOMPLETE",
      reason: "totals_mismatch",
    });
  });
});

describe("parité des agrégats sénatoriaux candidats", () => {
  it("calcule groupes et snapshots à partir des mêmes taux individuels", () => {
    const rows = [50, 75, 100].map((participationRate, index) => ({
      votesCount: index + 1,
      eligibleScrutins: 4,
      participationRate,
      partyId: "party-1",
      partyName: "Parti test",
      partyShortName: "PT",
      partyColor: null,
      partySlug: "parti-test",
      groupId: "group-1",
      groupName: "Groupe test",
      groupCode: "GT",
      groupColor: null,
    }));

    expect(aggregateSenateParticipation(rows, "party")[0]).toMatchObject({
      id: "party-1",
      avgParticipationRate: 75,
      memberCount: 3,
    });
    expect(aggregateSenateParticipation(rows, "group")[0]).toMatchObject({
      id: "group-1",
      avgParticipationRate: 75,
      memberCount: 3,
    });
  });
});

describe("candidat de participation sénatoriale", () => {
  it("utilise POUR + CONTRE + ABSTENTION sur ces positions plus NON_VOTANT", () => {
    expect(
      computeSenateParticipationCandidate({
        expressed: 3,
        nonVoting: 1,
        eligibleScrutins: 4,
        recordedRows: 4,
      })
    ).toEqual({ votesCount: 3, eligibleScrutins: 4, participationRate: 75 });
  });

  it.each([
    { expressed: 2, nonVoting: 1, eligibleScrutins: 4, recordedRows: 3 },
    { expressed: 2, nonVoting: 1, eligibleScrutins: 4, recordedRows: 4 },
    { expressed: 0, nonVoting: 0, eligibleScrutins: 0, recordedRows: 0 },
  ])("neutralise une identité ou un périmètre incomplet", (counts) => {
    expect(computeSenateParticipationCandidate(counts)).toBeNull();
  });
});
