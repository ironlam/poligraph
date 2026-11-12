import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupeDetail: vi.fn(),
  getGroupKeyVotes: vi.fn(),
  getGovernmentProjectPositionsForGroup: vi.fn(async () => null),
  voteCard: vi.fn(),
  presidents: [] as unknown[],
}));

vi.mock("@/lib/data/groupes", () => ({
  getGroupeDetail: (slug: string) => mocks.getGroupeDetail(slug),
  getGroupKeyVotes: (groupId: string) => mocks.getGroupKeyVotes(groupId),
  getGroupHemicyclePlacement: async () => null,
  getGroupPresidents: async () => mocks.presidents,
}));
vi.mock("@/lib/data/government-project-positions", () => ({
  getGovernmentProjectPositionsForGroup: mocks.getGovernmentProjectPositionsForGroup,
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

  it("nomme la présidence du groupe, accordée et datée, avec sa source", async () => {
    mocks.getGroupeDetail.mockResolvedValue({
      id: "group-senat",
      name: "Groupe du Sénat",
      shortName: "GS",
      code: "GS",
      chamber: "SENAT",
      legislature: null,
      color: null,
      seatCount: 12,
      stats: [],
      members: [],
    });
    mocks.getGroupKeyVotes.mockResolvedValue([]);
    mocks.presidents = [
      {
        politician: {
          slug: "alix-exemple",
          firstName: "Alix",
          lastName: "Exemple",
          fullName: "Alix Exemple",
          civility: "Mme",
          photoUrl: null,
          blobPhotoUrl: null,
        },
        since: new Date("2023-10-03T00:00:00Z"),
        sourceUrl: "https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.csv",
      },
    ];

    render(await GroupeDetailPage({ params: Promise.resolve({ slug: "gs-senat" }) }));

    const link = screen.getByRole("link", { name: /Alix Exemple/ });
    expect(link).toHaveAttribute("href", "/politiques/alix-exemple");
    expect(link).toHaveTextContent("Présidente du groupe depuis le 3 octobre 2023");
    expect(screen.getByRole("link", { name: /Données ouvertes, Sénat/ })).toHaveAttribute(
      "href",
      "https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.csv"
    );
    mocks.presidents = [];
  });

  it("n'affiche aucune présidence quand elle est inconnue", async () => {
    mocks.getGroupeDetail.mockResolvedValue({
      id: "group-senat",
      name: "Groupe du Sénat",
      shortName: "GS",
      code: "GS",
      chamber: "SENAT",
      legislature: null,
      color: null,
      seatCount: 12,
      stats: [],
      members: [],
    });
    mocks.getGroupKeyVotes.mockResolvedValue([]);

    render(await GroupeDetailPage({ params: Promise.resolve({ slug: "gs-senat" }) }));

    expect(screen.queryByText(/Présiden/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Données ouvertes/ })).toBeNull();
  });

  it("explique l'absence de position calculée pour les non-inscrits AN", async () => {
    mocks.getGroupeDetail.mockResolvedValue({
      id: "group-ni",
      name: "Non-inscrits",
      shortName: null,
      code: "NI",
      chamber: "AN",
      color: null,
      seatCount: 4,
      stats: [],
      members: [],
    });
    mocks.getGroupKeyVotes.mockResolvedValue([]);

    render(await GroupeDetailPage({ params: Promise.resolve({ slug: "ni" }) }));

    expect(
      screen.getByText(
        "Non calculé pour les non-inscrits, qui ne constituent pas un groupe parlementaire."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir les scrutins et les exclusions" })).toBeNull();
    expect(mocks.getGovernmentProjectPositionsForGroup).not.toHaveBeenCalled();
  });
});
