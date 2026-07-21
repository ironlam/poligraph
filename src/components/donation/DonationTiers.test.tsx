import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonationTiers } from "./DonationTiers";
import { MONTHLY_TIERS } from "@/config/donation";

describe("DonationTiers", () => {
  it("affiche tous les montants mensuels", () => {
    render(<DonationTiers />);
    for (const t of MONTHLY_TIERS) {
      // Negative lookbehind avoids "5€" false-matching inside "15€"/"25€"/"50€".
      expect(screen.getByText(new RegExp(`(?<!\\d)${t.monthlyEuros}€`))).toBeInTheDocument();
    }
  });

  it("ne singularise aucun palier (pas de badge « Recommandé »)", () => {
    render(<DonationTiers />);
    expect(screen.queryByText(/recommand/i)).toBeNull();
  });

  it("n'affiche aucun bouton : l'échelle d'impact est purement informative", () => {
    render(<DonationTiers />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
