import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VoteCard } from "@/components/votes/VoteCard";

const props = {
  id: "1",
  externalId: "VTANR5L17V1",
  slug: "s",
  title: "Titre officiel",
  votingDate: new Date("2026-06-27"),
  legislature: 17,
  chamber: "AN" as const,
  votesFor: 100,
  votesAgainst: 20,
  votesAbstain: 5,
  result: "ADOPTED" as const,
};

describe("VoteCard compact", () => {
  it("omits the votants count in compact mode", () => {
    const { queryByText } = render(<VoteCard {...props} compact />);
    expect(queryByText(/votants/)).toBeNull();
  });
  it("keeps it in full mode", () => {
    const { queryByText } = render(<VoteCard {...props} />);
    expect(queryByText(/votants/)).not.toBeNull();
  });
});
