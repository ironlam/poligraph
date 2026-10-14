import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupeDetail: vi.fn(),
  getGroupKeyVotes: vi.fn(),
  voteCard: vi.fn(),
}));

vi.mock("@/lib/data/groupes", () => ({
  getGroupeDetail: (slug: string) => mocks.getGroupeDetail(slug),
  getGroupKeyVotes: (groupId: string) => mocks.getGroupKeyVotes(groupId),
}));
vi.mock("@/lib/data/government-project-positions", () => ({
  getGovernmentProjectPositionsForGroup: vi.fn(async () => null),
}));
vi.mock("@/components/votes", () => ({
  VoteCard: (props: Record<string, unknown>) => {
    mocks.voteCard(props);
    return <div data-testid="vote-card" />;
  },
}));

import GroupeDetailPage from "@/app/parlement/groupes/[slug]/page";

describe("/parlement/groupes/[slug] cartes de votes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("transmet les attributs réels d'un scrutin sénatorial à VoteCard", async () => {
    mocks.getGroupeDetail.mockResolvedValue({
      id: "group-senat",
      name: "Groupe du Sénat",
      shortName: "GS",
      code: "GS",
      chamber: "SENAT",
      color: null,
      seatCount: 12,
      stats: [],
      members: [],
    });
    mocks.getGroupKeyVotes.mockResolvedValue([
      {
        scrutin: {
          id: "scrutin-senat",
          externalId: "2026-42",
          slug: "2026-08-14-scrutin-senat",
          title: "Scrutin sénatorial de test",
          votingDate: new Date("2026-08-14T10:00:00Z"),
          legislature: 2026,
          chamber: "SENAT",
          votesFor: 180,
          votesAgainst: 120,
          votesAbstain: 10,
          result: "ADOPTED",
          sourceUrl: "https://www.senat.fr/scrutin-public/2026/scrutin-42.html",
          theme: null,
          policyTitle: null,
        },
      },
    ]);

    render(await GroupeDetailPage({ params: Promise.resolve({ slug: "groupe-senat" }) }));

    expect(mocks.voteCard).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "2026-42",
        legislature: 2026,
        chamber: "SENAT",
        sourceUrl: "https://www.senat.fr/scrutin-public/2026/scrutin-42.html",
      })
    );
  });
});
