import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeputesComparison } from "./DeputesComparison";

vi.mock("next/image", () => ({ default: (props: object) => <span {...props} /> }));
vi.mock("@/lib/db", () => ({ db: {} }));

function deputy(name: string) {
  return {
    id: name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    fullName: name,
    photoUrl: null,
    currentParty: null,
    currentMandate: {
      startDate: new Date("2024-07-08"),
      departmentCode: "75",
      constituency: null,
      parliamentaryData: null,
    },
    voteStats: {
      total: 0,
      pour: 0,
      contre: 0,
      abstention: 0,
      nonVotant: 0,
      eligibleScrutins: 0,
      scrutinsSansVoteEnregistre: null,
      presenceRate: null,
      participationStatus: "COMPUTATION_INCOMPLETE",
    },
    votes: [],
    affairs: [],
    declarations: [],
    factCheckMentions: [],
    _count: { factCheckMentions: 0 },
  } as never;
}

describe("comparateur des députés", () => {
  it("ne transforme pas le taux null de Chantal Bouloux ou Emmanuelle Hoffman en 0 %", () => {
    render(
      <DeputesComparison left={deputy("Chantal Bouloux")} right={deputy("Emmanuelle Hoffman")} />
    );

    expect(screen.getAllByText("Participation indisponible")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});
