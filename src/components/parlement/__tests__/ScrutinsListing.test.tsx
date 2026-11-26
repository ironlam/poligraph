import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/scrutins", () => ({
  getScrutins: vi.fn().mockResolvedValue({
    scrutins: [],
    total: 0,
    totalPages: 0,
    stats: {},
  }),
  getLegislatures: vi.fn().mockResolvedValue([]),
  getChambers: vi.fn().mockResolvedValue([]),
  getThemeCounts: vi.fn().mockResolvedValue([
    { theme: "SANTE", _count: 12 },
    { theme: "ECONOMIE_BUDGET", _count: 8 },
  ]),
  getTypeCounts: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/data/groupes", () => ({
  getScrutinGroupPositionsBatch: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/components/votes", () => ({ VoteCard: () => null }));
vi.mock("@/components/votes/VotesFilterBar", () => ({ VotesFilterBar: () => null }));
vi.mock("../ExplainedVotesModule", () => ({ ExplainedVotesModule: () => null }));
vi.mock("@/components/seo/JsonLd", () => ({ CollectionPageJsonLd: () => null }));

import { ScrutinsListing } from "../ScrutinsListing";

describe("ScrutinsListing thematic landings", () => {
  it("rend des liens naturels avec une hauteur tactile minimale", async () => {
    render(await ScrutinsListing({ searchParams: {}, sort: "recent" }));

    const healthLink = screen.getByRole("link", { name: "Votes sur la santé 12" });
    expect(healthLink).toHaveAttribute("href", "/parlement/votes/themes/sante");
    expect(healthLink).toHaveClass("inline-flex", "min-h-11", "items-center");

    const economyLink = screen.getByRole("link", {
      name: "Votes sur l'économie et le budget 8",
    });
    expect(economyLink).toHaveAttribute("href", "/parlement/votes/themes/economie-budget");
  });
});

describe("H1 de la liste des votes", () => {
  it.each([
    [{}, "Qui vote quoi ? Votes de l'Assemblée et du Sénat"],
    [{ chamber: "AN" }, "Votes de l'Assemblée nationale"],
    [{ chamber: "SENAT" }, "Votes du Sénat"],
    [{ theme: "SANTE" }, "Votes parlementaires"],
    [{ sort: "recent" }, "Votes parlementaires"],
    [{ page: "2" }, "Votes parlementaires"],
    [{ filter: "expliques" }, "Votes expliqués"],
    [{ filter: "expliques", chamber: "AN" }, "Votes expliqués"],
  ])("préserve le titre attendu pour %j", async (searchParams, title) => {
    render(await ScrutinsListing({ searchParams, sort: "recent" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
  });
});
