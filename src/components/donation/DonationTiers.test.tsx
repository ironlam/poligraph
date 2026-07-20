import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonationDialogProvider } from "./DonationDialogProvider";
import { DonationTiers } from "./DonationTiers";
import { DONATION_PREFILL_MODE, MONTHLY_TIERS } from "@/config/donation";

function renderTiers() {
  return render(
    <DonationDialogProvider source="support-page">
      <DonationTiers />
    </DonationDialogProvider>
  );
}

describe("DonationTiers", () => {
  it("affiche un palier Recommandé", () => {
    renderTiers();
    expect(screen.getByText("Recommandé")).toBeInTheDocument();
  });
  it("affiche tous les montants mensuels", () => {
    renderTiers();
    for (const t of MONTHLY_TIERS) {
      // Negative lookbehind avoids "5€" false-matching inside "15€"/"25€"/"50€".
      expect(screen.getByText(new RegExp(`(?<!\\d)${t.monthlyEuros}€`))).toBeInTheDocument();
    }
  });
  it("en mode unsupported, aucun bouton ne prétend présélectionner un montant", () => {
    renderTiers();
    if (DONATION_PREFILL_MODE === "unsupported") {
      expect(screen.queryByRole("button", { name: /soutenir 10 € par mois/i })).toBeNull();
      expect(
        screen.getAllByRole("button", { name: /choisir mon montant/i }).length
      ).toBeGreaterThan(0);
    }
  });
});
