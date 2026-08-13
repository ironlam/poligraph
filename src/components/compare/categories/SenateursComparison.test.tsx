import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SenateursComparison } from "./SenateursComparison";

vi.mock("next/image", () => ({ default: (props: object) => <span {...props} /> }));
vi.mock("@/lib/db", () => ({ db: {} }));

const politician = (name: string) =>
  ({
    id: name,
    slug: name.toLowerCase(),
    fullName: name,
    photoUrl: null,
    currentParty: null,
    currentMandate: {
      startDate: new Date("2023-10-01"),
      departmentCode: "33",
      constituency: null,
      parliamentaryData: null,
    },
    voteStats: {
      total: 4,
      pour: 1,
      contre: 1,
      abstention: 1,
      nonVotant: 1,
      eligibleScrutins: null,
      scrutinsSansVoteEnregistre: null,
      presenceRate: null,
      participationStatus: "SOURCE_INSUFFICIENT",
    },
    votes: [
      {
        scrutinId: "scrutin-1",
        position: "POUR",
        scrutin: {
          id: "scrutin-1",
          title: "Texte public",
          slug: "texte-public",
          votingDate: new Date("2026-01-01"),
        },
      },
    ],
    affairs: [],
    declarations: [],
    factCheckMentions: [],
    _count: { factCheckMentions: 0 },
  }) as never;

describe("comparateur des sénateurs", () => {
  it("masque uniquement la participation et conserve les autres catégories", () => {
    render(
      <SenateursComparison left={politician("Alice Martin")} right={politician("Luc Bernard")} />
    );

    const notice = screen.getByText(/ne publie pas actuellement une donnée/);
    expect(notice).toBeInTheDocument();
    expect(notice.closest("section")).not.toHaveTextContent(/\d+\s*%/);
    expect(screen.getByText(/Concordance de vote/)).toBeInTheDocument();
  });
});
