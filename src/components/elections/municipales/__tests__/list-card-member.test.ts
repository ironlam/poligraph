import { describe, expect, it } from "vitest";
import { toListCardMember } from "@/components/elections/municipales/list-card-member";

describe("toListCardMember", () => {
  it("drops every candidacy field ListCard does not render", () => {
    const row = {
      id: "c1",
      candidateName: "Jeanne Martin",
      listPosition: 2,
      candidate: { gender: "F", id: "cand1", birthDate: new Date("1970-01-01"), nuance: "DVG" },
      politician: null,
      participationRate: null,
      affairsCount: 0,
      electionId: "e1",
      sourceUrl: "https://www.data.gouv.fr/x",
      createdAt: new Date(),
      updatedAt: new Date(),
      round1Votes: 1234,
    };

    expect(toListCardMember(row)).toEqual({
      id: "c1",
      candidateName: "Jeanne Martin",
      listPosition: 2,
      candidate: { gender: "F" },
      politician: null,
      participationRate: null,
      affairsCount: 0,
    });
  });

  it("keeps a candidacy without a candidate record", () => {
    const member = toListCardMember({
      id: "c2",
      candidateName: "Paul Durand",
      listPosition: null,
      candidate: null,
      politician: null,
    });
    expect(member.candidate).toBeNull();
  });
});
