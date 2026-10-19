import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPolitician: vi.fn(),
  findVotes: vi.fn(),
  getCoverage: vi.fn(),
  getStats: vi.fn(),
  getCounts: vi.fn(),
  getLegislatures: vi.fn(),
  getLegislatureVotes: vi.fn(),
  voteStatsProps: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findUnique: (...args: unknown[]) => mocks.findPolitician(...args) },
    vote: { findMany: (...args: unknown[]) => mocks.findVotes(...args) },
  },
}));
vi.mock("@/services/voteStats", () => ({
  getPoliticianVoteChamberCoverage: (...args: unknown[]) => mocks.getCoverage(...args),
  getPoliticianVotingStats: (...args: unknown[]) => mocks.getStats(...args),
  getPoliticianVoteTabCounts: (...args: unknown[]) => mocks.getCounts(...args),
}));
vi.mock("@/services/politician-legislature-votes", () => ({
  getPoliticianAnLegislatures: (...args: unknown[]) => mocks.getLegislatures(...args),
  getPoliticianLegislatureVotes: (...args: unknown[]) => mocks.getLegislatureVotes(...args),
}));
vi.mock("@/lib/seo/politician-index-signals", () => ({
  getPoliticianIndexSignals: vi.fn(async () => null),
}));
vi.mock("@/components/votes", () => ({
  VoteStats: (props: unknown) => {
    mocks.voteStatsProps(props);
    return null;
  },
  VotePositionBadge: () => null,
  VotingResultBadge: () => null,
}));

import PoliticianVotesPage, { generateMetadata } from "@/app/politiques/[slug]/votes/page";

type Chamber = "AN" | "SENAT";
type Mandate = { type: string; isCurrent: boolean; role: string | null };

const cases: Array<{
  caseName: string;
  slug: string;
  chambers: Chamber[];
  mandates: Mandate[];
  totalVotes: number;
  title: string;
  descriptionChamber: string | null;
  heading: string;
  intro: string;
}> = [
  {
    caseName: "votes AN uniquement",
    slug: "camille-an",
    chambers: ["AN"],
    mandates: [{ type: "DEPUTE", isCurrent: true, role: null }],
    totalVotes: 4,
    title: "Votes de Camille Durand à l'Assemblée nationale",
    descriptionChamber: "Assemblée nationale",
    heading: "Votes de Camille Durand à l'Assemblée nationale",
    intro: "Au total, 4 votes de Camille Durand sont enregistrés à l'Assemblée nationale.",
  },
  {
    caseName: "votes Sénat uniquement",
    slug: "camille-senat",
    chambers: ["SENAT"],
    mandates: [{ type: "SENATEUR", isCurrent: true, role: null }],
    totalVotes: 4,
    title: "Votes de Camille Durand au Sénat",
    descriptionChamber: "Sénat",
    heading: "Votes de Camille Durand au Sénat",
    intro: "Au total, 4 votes de Camille Durand sont enregistrés au Sénat.",
  },
  {
    caseName: "votes AN et Sénat",
    slug: "camille-mixte",
    chambers: ["AN", "SENAT"],
    mandates: [],
    totalVotes: 4,
    title: "Votes parlementaires de Camille Durand",
    descriptionChamber: null,
    heading: "Votes parlementaires de Camille Durand",
    intro: "Au total, 4 votes de Camille Durand sont enregistrés.",
  },
  {
    caseName: "sénateur courant et ancien député avec corpus mixte",
    slug: "camille-senatrice",
    chambers: ["AN", "SENAT"],
    mandates: [
      { type: "DEPUTE", isCurrent: false, role: null },
      { type: "SENATEUR", isCurrent: true, role: null },
    ],
    totalVotes: 4,
    title: "Votes parlementaires de Camille Durand",
    descriptionChamber: null,
    heading: "Votes parlementaires de Camille Durand",
    intro: "Au total, 4 votes de Camille Durand sont enregistrés.",
  },
  {
    caseName: "député courant et ancien sénateur avec corpus mixte",
    slug: "camille-deputee",
    chambers: ["AN", "SENAT"],
    mandates: [
      { type: "SENATEUR", isCurrent: false, role: null },
      { type: "DEPUTE", isCurrent: true, role: null },
    ],
    totalVotes: 4,
    title: "Votes parlementaires de Camille Durand",
    descriptionChamber: null,
    heading: "Votes parlementaires de Camille Durand",
    intro: "Au total, 4 votes de Camille Durand sont enregistrés.",
  },
  {
    caseName: "aucun vote",
    slug: "camille-sans-vote",
    chambers: [],
    mandates: [{ type: "SENATEUR", isCurrent: true, role: null }],
    totalVotes: 0,
    title: "Votes parlementaires de Camille Durand",
    descriptionChamber: null,
    heading: "Votes parlementaires de Camille Durand",
    intro: "Aucun vote parlementaire n'est enregistré pour Camille Durand.",
  },
];

describe("/politiques/[slug]/votes copie fondée sur le corpus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findVotes.mockResolvedValue([]);
    mocks.getLegislatures.mockResolvedValue([]);
    mocks.getStats.mockResolvedValue({
      total: 0,
      pour: 0,
      contre: 0,
      abstention: 0,
      nonVotant: 0,
      eligibleScrutins: null,
      scrutinsSansVoteEnregistre: null,
      participationRate: null,
      participationStatus: "COMPUTATION_INCOMPLETE",
    });
  });

  it.each(cases)(
    "$caseName: title, description, H1 et intro restent factuels",
    async ({ slug, chambers, mandates, totalVotes, title, descriptionChamber, heading, intro }) => {
      mocks.findPolitician.mockResolvedValue({
        id: `politician-${slug}`,
        slug,
        fullName: "Camille Durand",
        firstName: "Camille",
        lastName: "Durand",
        photoUrl: null,
        civility: "Mme",
        currentParty: null,
        mandates,
      });
      mocks.getCoverage.mockResolvedValue(chambers);
      mocks.getCounts.mockResolvedValue({
        totalAll: totalVotes,
        amendmentCount: 0,
        nonAmendmentCount: totalVotes,
      });

      const props = {
        params: Promise.resolve({ slug }),
        searchParams: Promise.resolve({}),
      };
      const metadata = await generateMetadata(props);
      const view = render(await PoliticianVotesPage(props));

      expect(metadata.title).toBe(title);
      if (descriptionChamber) {
        expect(metadata.description).toContain(descriptionChamber);
      } else {
        expect(metadata.description).not.toContain("Assemblée nationale");
        expect(metadata.description).not.toContain("Sénat");
      }
      expect(view.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
      expect(view.getByText(intro)).toBeInTheDocument();
    }
  );
});

describe("/politiques/[slug]/votes par législature", () => {
  const view = (legislature: number, issue: string | null = null) => ({
    legislature,
    counts: { total: 7, amendments: 3, nonAmendments: 4 },
    stats: {
      total: 7,
      pour: 4,
      contre: 2,
      abstention: 1,
      nonVotant: 0,
      eligibleScrutins: issue ? null : 20,
      scrutinsSansVoteEnregistre: issue ? null : 13,
      participationRate: issue ? null : 35,
      participationStatus: issue ? "COMPUTATION_INCOMPLETE" : "AVAILABLE",
    },
    perimeter: { issue, periods: [] },
  });

  async function renderFor(searchParams: Record<string, string>, chambers: Chamber[] = ["AN"]) {
    mocks.findPolitician.mockResolvedValue({
      id: "politician-depute",
      slug: "camille-depute",
      fullName: "Camille Durand",
      firstName: "Camille",
      lastName: "Durand",
      photoUrl: null,
      civility: "Mme",
      currentParty: null,
      mandates: [],
    });
    mocks.getCoverage.mockResolvedValue(chambers);
    mocks.getLegislatureVotes.mockImplementation(async (_id: string, legislature: number) =>
      view(legislature)
    );
    return render(
      await PoliticianVotesPage({
        params: Promise.resolve({ slug: "camille-depute" }),
        searchParams: Promise.resolve(searchParams),
      })
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findVotes.mockResolvedValue([]);
    mocks.getLegislatures.mockResolvedValue([
      { legislature: 17, totalVotes: 40 },
      { legislature: 16, totalVotes: 30 },
    ]);
  });

  it("affiche la législature la plus récente par défaut, sur un seul périmètre", async () => {
    const page = await renderFor({});

    expect(mocks.getLegislatureVotes).toHaveBeenCalledWith("politician-depute", 17);
    expect(mocks.findVotes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scrutin: { legislature: 17, chamber: "AN" } }),
      })
    );
    expect(mocks.getStats).not.toHaveBeenCalled();
    expect(mocks.getCounts).not.toHaveBeenCalled();
    expect(page.getByText(/4 votes enregistrés, 17ᵉ législature/)).toBeInTheDocument();
    expect(
      page.getByText(/Pour la 17ᵉ législature \(depuis 2024\), 7 votes de Camille Durand/)
    ).toBeInTheDocument();
  });

  it("transmet le périmètre et la raison d'incertitude aux statistiques", async () => {
    mocks.getLegislatureVotes.mockImplementation(async (_id: string, legislature: number) =>
      view(legislature, "NO_MANDATE")
    );
    mocks.findPolitician.mockResolvedValue({
      id: "politician-depute",
      slug: "camille-depute",
      fullName: "Camille Durand",
      firstName: "Camille",
      lastName: "Durand",
      photoUrl: null,
      civility: "Mme",
      currentParty: null,
      mandates: [],
    });
    mocks.getCoverage.mockResolvedValue(["AN"]);

    render(
      await PoliticianVotesPage({
        params: Promise.resolve({ slug: "camille-depute" }),
        searchParams: Promise.resolve({ legislature: "16" }),
      })
    );

    expect(mocks.getLegislatureVotes).toHaveBeenCalledWith("politician-depute", 16);
    expect(mocks.voteStatsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          issue: "NO_MANDATE",
          label: expect.stringContaining("16"),
        }),
      })
    );
  });

  it.each(["99", "15", "abc", "17abc"])(
    "ignore ?legislature=%s et applique la législature par défaut",
    async (raw) => {
      await renderFor({ legislature: raw });

      expect(mocks.getLegislatureVotes).toHaveBeenCalledWith("politician-depute", 17);
    }
  );

  it("propose un sélecteur nommé et garde le paramètre dans les liens", async () => {
    const page = await renderFor({ legislature: "16", type: "tous" });

    const nav = page.getByRole("navigation", { name: "Choisir une législature" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/politiques/camille-depute/votes?type=tous",
      "/politiques/camille-depute/votes?type=tous&legislature=16",
    ]);
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent(/16ᵉ législature/);
  });

  it("n'applique aucune législature à un corpus Sénat", async () => {
    await renderFor({ legislature: "17" }, ["SENAT"]);

    expect(mocks.getLegislatures).not.toHaveBeenCalled();
    expect(mocks.getLegislatureVotes).not.toHaveBeenCalled();
    expect(mocks.getStats).toHaveBeenCalled();
  });

  it("garde le comportement actuel pour un corpus AN sans législature importée", async () => {
    mocks.getLegislatures.mockResolvedValue([]);
    mocks.getStats.mockResolvedValue(view(17).stats);
    mocks.getCounts.mockResolvedValue({ totalAll: 4, amendmentCount: 0, nonAmendmentCount: 4 });

    await renderFor({ legislature: "17" });

    expect(mocks.getLegislatureVotes).not.toHaveBeenCalled();
    expect(mocks.getStats).toHaveBeenCalled();
  });
});
