import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KPIStrip } from "@/components/home/KPIStrip";
import type { HomepageKPIs } from "@/lib/data/homepage";

const base: HomepageKPIs = {
  politiciansCount: 22683,
  condamnationsCount: 127,
  proceduresEnCoursCount: 34,
  closesSansCondamnationCount: 60,
  votesCount: 12829,
  factchecksCount: 829,
};

describe("KPIStrip — chiffres + barre de certitude", () => {
  it("rend les trois compteurs neutres", () => {
    render(<KPIStrip kpis={base} />);
    expect(screen.getByText("Politiques suivis")).toBeInTheDocument();
    expect(screen.getByText("Votes analysés")).toBeInTheDocument();
    expect(screen.getByText("Fact-checks vérifiés")).toBeInTheDocument();
  });

  it("barre de certitude : légende détaillée et rappel de présomption", () => {
    render(<KPIStrip kpis={base} />);
    expect(screen.getByText("Condamnations définitives")).toBeInTheDocument();
    expect(screen.getByText("Procédures en cours")).toBeInTheDocument();
    expect(screen.getByText("Classées sans condamnation")).toBeInTheDocument();
    expect(screen.getByText(/présomption d'innocence s'applique/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Répartition des affaires documentées/ })
    ).toBeInTheDocument();
  });

  it("aucune affaire documentée : pas de barre de certitude", () => {
    render(
      <KPIStrip
        kpis={{
          ...base,
          condamnationsCount: 0,
          proceduresEnCoursCount: 0,
          closesSansCondamnationCount: 0,
        }}
      />
    );
    expect(screen.queryByText("Affaires judiciaires documentées")).toBeNull();
    // Les compteurs restent affichés.
    expect(screen.getByText("Politiques suivis")).toBeInTheDocument();
  });
});
