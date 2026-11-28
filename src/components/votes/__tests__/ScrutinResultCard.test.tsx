import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrutinResultCard } from "@/components/votes/ScrutinResultCard";

const censure = (seatsFilled: number | null) =>
  render(
    <ScrutinResultCard
      votesFor={331}
      votesAgainst={0}
      votesAbstain={0}
      source={null}
      isMotionDeCensure
      seatsFilled={seatsFilled}
    />
  );

describe("ScrutinResultCard, motion de censure", () => {
  // Regression: 289 was hardcoded, wrong for 13 of the 57 motions (288 or 287 with vacant seats).
  it("affiche la majorité du jour, pas 289 en dur", () => {
    censure(574);
    expect(screen.getByText("288 nécessaires (majorité absolue)")).toBeInTheDocument();
    expect(screen.getByText(/\(288 sur 574 sièges pourvus ce jour-là\)/)).toBeInTheDocument();
  });

  it("garde 289 quand les 577 sièges sont pourvus", () => {
    censure(577);
    expect(screen.getByText("289 nécessaires (majorité absolue)")).toBeInTheDocument();
  });

  it("n'affiche aucun seuil sans décompte officiel lisible", () => {
    censure(null);
    expect(screen.queryByText(/nécessaires/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sièges pourvus/)).not.toBeInTheDocument();
    expect(screen.getByText("331 voix pour la censure")).toBeInTheDocument();
  });
});
