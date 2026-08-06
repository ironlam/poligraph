import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubStats } from "../HubStats";

describe("HubStats", () => {
  it("montre le compte de mesures vérifiées et la date de dernière revue, jamais un 100 %", () => {
    render(<HubStats verifiedMeasureCount={12} lastReviewedAt={new Date("2026-08-02")} />);
    expect(screen.getByText(/12 mesures vérifiées/)).toBeInTheDocument();
    expect(screen.getByText(/Dernière revue/)).toBeInTheDocument();
    expect(screen.queryByText(/100 %/)).not.toBeInTheDocument();
  });

  it("rend un état de lancement honnête quand rien n'est vérifié", () => {
    render(<HubStats verifiedMeasureCount={0} lastReviewedAt={null} />);
    expect(screen.getByText(/Aucune mesure vérifiée pour l'instant/)).toBeInTheDocument();
    expect(screen.queryByText(/100 %/)).not.toBeInTheDocument();
  });
});
