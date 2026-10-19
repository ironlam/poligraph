import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VoteStats } from "../VoteStats";

function renderStats(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const available = {
  total: 7,
  pour: 4,
  contre: 2,
  abstention: 1,
  nonVotant: 0,
  eligibleScrutins: 20,
  scrutinsSansVoteEnregistre: 13,
  participationRate: 35,
  participationStatus: "AVAILABLE" as const,
};

const incomplete = {
  ...available,
  eligibleScrutins: null,
  scrutinsSansVoteEnregistre: null,
  participationRate: null,
  participationStatus: "COMPUTATION_INCOMPLETE" as const,
};

const period = {
  start: new Date("2022-07-11T00:00:00.000Z"),
  end: new Date("2024-06-07T00:00:00.000Z"),
};

describe("VoteStats par législature", () => {
  it("nomme la législature et le type de scrutin couvert", () => {
    renderStats(
      <VoteStats
        stats={available}
        scope={{ label: "16ᵉ législature (2022-2024)", issue: null, periods: [period] }}
      />
    );

    expect(screen.getByText(/16ᵉ législature \(2022-2024\), tous types de scrutin/)).toBeVisible();
  });

  it("affiche le taux, son dénominateur et la période retenue, sans parler d'absence certaine", () => {
    renderStats(
      <VoteStats
        stats={available}
        scope={{ label: "16ᵉ législature", issue: null, periods: [period] }}
      />
    );

    expect(screen.getByText("35%")).toBeVisible();
    const note = screen.getByText(/Position exprimée sur 7 des 20 scrutins tenus/);
    expect(note).toHaveTextContent("du 11 juillet 2022 au 7 juin 2024");
    expect(note).toHaveTextContent("n'est pas forcément une absence");
    expect(document.body).not.toHaveTextContent(/présent à|absent à/i);
  });

  it.each([
    ["NO_MANDATE", /Aucun mandat de député couvrant des scrutins de cette législature/],
    ["OVERLAPPING_MANDATES", /Des mandats de député se chevauchent/],
    ["VOTES_OUTSIDE_MANDATE", /Des votes sont enregistrés en dehors des dates de mandat connues/],
  ] as const)("explique pourquoi aucun taux n'est calculé : %s", (issue, copy) => {
    renderStats(
      <VoteStats stats={incomplete} scope={{ label: "16ᵉ législature", issue, periods: [] }} />
    );

    expect(screen.getByText(copy)).toBeVisible();
    expect(screen.getByText(/le taux de participation n.est pas calculé/)).toBeVisible();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    // Les positions enregistrées restent affichées : seul le taux est retenu.
    expect(screen.getByText(/4 exprimés|7 exprimés|Répartition des votes/)).toBeVisible();
  });

  it("garde le message générique hors périmètre de législature", () => {
    renderStats(<VoteStats stats={incomplete} />);

    expect(screen.getByText(/Le périmètre nécessaire au calcul de la participation/)).toBeVisible();
  });
});
