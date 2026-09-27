import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsOverview } from "../ResultsOverview";
import { summary } from "./results-fixtures";

describe("ResultsOverview : l'état 4 du hub", () => {
  it("compte les circonscriptions sur 64, jamais sur 63", () => {
    render(<ResultsOverview summary={summary()} />);
    expect(screen.getByText(/circonscriptions publiées sur 64/)).toBeInTheDocument();
    expect(screen.queryByText(/sur 63/)).not.toBeInTheDocument();
  });

  it("remplace réélus et nouveaux par une donnée manquante tant qu'un élu n'est pas rattaché", () => {
    render(<ResultsOverview summary={summary({ unresolved: 3 })} />);
    expect(screen.queryByText("sortants réélus")).not.toBeInTheDocument();
    expect(screen.queryByText("nouveaux sénateurs")).not.toBeInTheDocument();
    expect(screen.getByText(/3 élus ne sont pas encore reliés/)).toBeInTheDocument();
  });

  it("affiche réélus et nouveaux quand tous sont rattachés", () => {
    render(<ResultsOverview summary={summary({ unresolved: 0, reelected: 102, newcomers: 76 })} />);
    expect(screen.getByText("102")).toBeInTheDocument();
    expect(screen.getByText("76")).toBeInTheDocument();
  });

  it("n'annonce les 178 sièges pourvus qu'une fois tous publiés", () => {
    const { rerender } = render(<ResultsOverview summary={summary({ seatsFilled: 120 })} />);
    expect(screen.queryByText(/178 sièges pourvus/)).not.toBeInTheDocument();
    expect(screen.getByText(/120 sièges sur 178/)).toBeInTheDocument();
    rerender(
      <ResultsOverview summary={summary({ seatsFilled: 178, proclaimedConstituencies: 64 })} />
    );
    expect(screen.getByText(/178 sièges pourvus le 27 septembre/)).toBeInTheDocument();
    // A resignation or a death changes a seat before 2029: "inchangés" would be false.
    expect(screen.queryByText(/inchangés/)).not.toBeInTheDocument();
    expect(screen.getByText(/ne sont pas renouvelés avant 2029/)).toBeInTheDocument();
  });

  it("ne transforme pas une part de femmes inconnue en zéro", () => {
    render(<ResultsOverview summary={summary({ womenShare: null })} />);
    expect(screen.queryByText(/0\s?%/)).not.toBeInTheDocument();
  });

  it("formate la part de femmes en français", () => {
    render(<ResultsOverview summary={summary({ womenShare: 0.4 })} />);
    expect(screen.getByText(/^40\s%$/)).toBeInTheDocument();
  });
});
