import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getComparison = vi.fn();
vi.mock("@/lib/data/presidential-comparison", () => ({
  getPresidentialComparison: (...args: unknown[]) => getComparison(...args),
}));

describe("comparaison présidentielle", () => {
  it("présente les mesures côte à côte et qualifie une absence", async () => {
    getComparison.mockResolvedValue({
      candidateOptions: [
        { candidacyId: "c1", name: "Alice Martin", slug: "alice-martin", partyLabel: "A" },
        { candidacyId: "c2", name: "Bruno Zola", slug: "bruno-zola", partyLabel: "B" },
      ],
      themes: [{ code: "SANTE", slug: "sante", label: "Santé" }],
      selectedTheme: { code: "SANTE", slug: "sante", label: "Santé" },
      selectedCandidates: [
        {
          candidacyId: "c1",
          name: "Alice Martin",
          slug: "alice-martin",
          partyLabel: "A",
          accentColor: null,
          totalMeasures: 1,
          page: 1,
          totalPages: 1,
          measures: [
            {
              id: "m1",
              slug: "ouvrir-un-centre",
              text: "Ouvrir un centre de santé.",
              sourceUrl: "https://example.org/source",
              subtopics: [{ slug: "acces-aux-soins", label: "Accès aux soins" }],
              precision: "CHIFFREE",
              qualifications: [{ id: "q1", label: "Financement précisé" }],
              withdrawal: null,
            },
          ],
        },
        {
          candidacyId: "c2",
          name: "Bruno Zola",
          slug: "bruno-zola",
          partyLabel: "B",
          accentColor: null,
          totalMeasures: 0,
          page: 1,
          totalPages: 1,
          measures: [],
        },
      ],
      lastReviewedAt: new Date("2026-08-29T00:00:00Z"),
    });

    const { default: Page } = await import("./page");
    render(
      await Page({
        searchParams: Promise.resolve({ candidat: ["alice-martin", "bruno-zola"], theme: "sante" }),
      })
    );

    expect(screen.getByRole("heading", { name: "Santé", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Ouvrir un centre de santé.")).toBeInTheDocument();
    expect(screen.queryByText("Objectif quantifié")).not.toBeInTheDocument();
    expect(screen.getByText("Financement précisé")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accès aux soins" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/recherche?sous-theme=acces-aux-soins"
    );
    expect(screen.getByText(/Poligraph n'a pas encore trouvé ou traité/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la mesure" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/mesures/ouvrir-un-centre"
    );
  });

  it("reste noindex pour éviter les combinaisons dupliquées", async () => {
    const { metadata } = await import("./page");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/comparer");
  });
});
