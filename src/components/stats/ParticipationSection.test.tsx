import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParticipationSection } from "./ParticipationSection";

describe("statistiques de participation", () => {
  it("ne publie ni classement, ni moyenne, ni agrégat Sénat", () => {
    render(
      <ParticipationSection groupDissidenceAN={[]} groupDissidenceSENAT={[]} chamber="SENAT" />
    );

    expect(screen.getByText(/reste indisponible pendant la validation/)).toBeInTheDocument();
    expect(screen.getByText(/Elle ne mesure jamais la présence physique/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun classement, taux moyen ou taux par parti/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*%/)).not.toBeInTheDocument();
  });

  it("ne transforme pas l'absence d'agrégat AN en 0 %", () => {
    render(<ParticipationSection groupDissidenceAN={[]} groupDissidenceSENAT={[]} chamber="AN" />);

    expect(
      screen.getByText(/Les agrégats de participation ne sont pas publiés/)
    ).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});
