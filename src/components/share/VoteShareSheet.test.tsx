import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VoteShareSheet } from "./VoteShareSheet";

const data = {
  title: "Projet de loi de finances",
  text: "Vote n°1 : Projet de loi de finances (Adopté)",
  url: "https://poligraph.fr/parlement/votes/2025-01-15-plf",
};

const card = {
  title: "Projet de loi de finances",
  chamberLabel: "Assemblée nationale",
  dateLabel: "15 janvier 2025",
  adopted: true,
  votesFor: 289,
  votesAgainst: 251,
  votesAbstain: 12,
  callToAction: "Le détail du vote sur poligraph.fr",
  source: "Source : Assemblée nationale, scrutin du 15 janvier 2025",
};

function open(withCard: boolean) {
  render(<VoteShareSheet slug="2025-01-15-plf" data={data} card={withCard ? card : null} />);
  fireEvent.click(screen.getByRole("button", { name: "Partager ce vote" }));
}

describe("VoteShareSheet", () => {
  it("stays closed until asked", () => {
    render(<VoteShareSheet slug="2025-01-15-plf" data={data} card={card} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("describes the image in words: result, counts and source", () => {
    open(true);
    const image = screen.getByRole("img", { name: /Image à partager/ });
    const name = image.getAttribute("aria-label") ?? "";
    expect(name).toContain("Adopté");
    expect(name).toContain("289 pour");
    expect(name).toContain("251 contre");
    expect(name).toContain("Source : Assemblée nationale");
  });

  it("links the four networks to the page of the scrutin, in a new tab", () => {
    open(true);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(data.url);
    }
  });

  it("offers the link alone when the scrutin has no card", () => {
    open(false);
    expect(screen.queryByRole("img", { name: /Image à partager/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Partager l'image/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
});
