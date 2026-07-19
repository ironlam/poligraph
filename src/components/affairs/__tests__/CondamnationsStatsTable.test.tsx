import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  CondamnationsStatsTable,
  SEUIL_SUIVIS_TAUX,
} from "@/components/affairs/CondamnationsStatsTable";
import type { CondamnationsPartyStats } from "@/lib/data/condamnations";

const rows: CondamnationsPartyStats[] = [
  {
    partyId: "1",
    partySlug: "les-republicains",
    partyShortName: "LR",
    partyName: "Les Républicains",
    nSuivis: 309,
    nCondamnesDefinitifs: 5,
    nCondamnesPrononces: 8,
    tauxDefinitif: 5 / 309,
  },
  {
    partyId: "2",
    partySlug: "parti-radical-de-gauche",
    partyShortName: "PRG",
    partyName: "Parti radical de gauche",
    nSuivis: 5,
    nCondamnesDefinitifs: 1,
    nCondamnesPrononces: 1,
    tauxDefinitif: 1 / 5,
  },
  // Effectif exactement au seuil : le taux doit s'afficher (comparaison >=).
  {
    partyId: "3",
    partySlug: "parti-fictif",
    partyShortName: "PF",
    partyName: "Parti fictif",
    nSuivis: SEUIL_SUIVIS_TAUX,
    nCondamnesDefinitifs: 1,
    nCondamnesPrononces: 0,
    tauxDefinitif: 1 / SEUIL_SUIVIS_TAUX,
  },
];

describe("CondamnationsStatsTable", () => {
  it("affiche le taux quand l'effectif atteint le seuil", () => {
    render(<CondamnationsStatsTable rows={rows} />);
    expect(screen.getByText("1.6%")).toBeInTheDocument(); // LR, 309 suivis
    expect(screen.getByText("10.0%")).toBeInTheDocument(); // seuil, 10 suivis
  });

  it("masque le taux (n.s.) sous le seuil d'effectif", () => {
    render(<CondamnationsStatsTable rows={rows} />);
    // PRG (5 suivis) ne doit pas afficher son taux brut trompeur de 20%
    expect(screen.queryByText("20.0%")).not.toBeInTheDocument();
    expect(screen.getByTitle("Effectif trop faible pour un taux significatif")).toBeInTheDocument();
  });

  it("explique comment lire le tableau (brut vs taux)", () => {
    render(<CondamnationsStatsTable rows={rows} />);
    expect(screen.getByText(/Comment lire ce tableau/)).toBeInTheDocument();
  });

  it("n'affiche plus de jauge SVG (régression jauge trompeuse)", () => {
    const { container } = render(<CondamnationsStatsTable rows={rows} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("expose un lien Détails descriptif et unique par parti (a11y)", () => {
    render(<CondamnationsStatsTable rows={rows} />);
    expect(
      screen.getByRole("link", { name: "Voir les condamnations définitives — Les Républicains" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Voir les condamnations définitives — Parti radical de gauche",
      })
    ).toBeInTheDocument();
  });

  it("structure le tableau avec une légende et des en-têtes de colonnes", () => {
    render(<CondamnationsStatsTable rows={rows} currentMandat="locaux" />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Taux" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Élus suivis" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /Les Républicains/ })).toBeInTheDocument();
  });
});
