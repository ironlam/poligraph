import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekFeed } from "@/components/home/WeekFeed";
import type { WeeklyRecapData } from "@/lib/data/recap";

function makeRecap(overrides: Partial<WeeklyRecapData> = {}): WeeklyRecapData {
  const base = {
    weekStart: new Date("2026-07-27T00:00:00Z"),
    weekEnd: new Date("2026-08-03T00:00:00Z"),
    votes: { scrutins: [], adopted: 0, rejected: 0, total: 0 },
    activity: { topVoters: [] },
    affairs: { newAffairs: [], total: 0 },
    factChecks: { total: 0, trueCount: 0, falseCount: 0, mixedCount: 0, topPoliticians: [] },
    press: {
      articleCount: 0,
      topPoliticians: [],
      storiesOfTheWeek: [],
      byPolitician: [],
      byAffair: [],
    },
    platformUpdates: { updates: [], total: 0 },
  };
  return { ...base, ...overrides } as WeeklyRecapData;
}

describe("WeekFeed — Cette semaine", () => {
  it("rend un scrutin nommé avec sa pastille de résultat et le lien vers le vote", () => {
    render(
      <WeekFeed
        recap={makeRecap({
          votes: {
            scrutins: [
              {
                slug: "loi-x",
                title: "Loi sur le pouvoir d'achat",
                chamber: "AN",
                result: "ADOPTED",
                votesFor: 300,
                votesAgainst: 200,
                votesAbstain: 50,
                votingDate: new Date("2026-07-29T00:00:00Z"),
              },
            ],
            adopted: 1,
            rejected: 0,
            total: 1,
          },
        })}
      />
    );
    expect(screen.getByText("Adopté")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Loi sur le pouvoir d'achat/ });
    expect(link).toHaveAttribute("href", "/parlement/votes/loi-x");
  });

  it("agrège les affaires sans nom ni visage", () => {
    render(
      <WeekFeed
        recap={makeRecap({
          affairs: {
            newAffairs: [
              {
                slug: "affaire-1",
                title: "Affaire test",
                certaintyLevel: "EN_COURS",
                politicianName: "Jean Dupont",
                politicianSlug: "jean-dupont",
              },
            ],
            total: 2,
          },
        })}
      />
    );
    expect(screen.getByText(/2 nouvelles affaires documentées/)).toBeInTheDocument();
    // Homepage rule: no politician name/face next to affairs.
    expect(screen.queryByText(/Jean Dupont/)).toBeNull();
    expect(screen.queryByText(/Affaire test/)).toBeNull();
  });

  it("agrège les fact-checks avec le nombre de faux", () => {
    render(
      <WeekFeed
        recap={makeRecap({
          factChecks: { total: 3, trueCount: 1, falseCount: 1, mixedCount: 1, topPoliticians: [] },
        })}
      />
    );
    expect(screen.getByText(/3 fact-checks vérifiés/)).toBeInTheDocument();
    expect(screen.getByText(/1 faux/)).toBeInTheDocument();
  });

  it("recap null : ne rend rien", () => {
    const { container } = render(<WeekFeed recap={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("semaine vide : ne rend rien", () => {
    const { container } = render(<WeekFeed recap={makeRecap()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
