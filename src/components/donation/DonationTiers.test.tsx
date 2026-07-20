import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DonationDialogProvider } from "./DonationDialogProvider";
import { DonationTiers } from "./DonationTiers";
import { MONTHLY_TIERS } from "@/config/donation";

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

  it("n'affiche aucun bouton prétendant présélectionner un montant", () => {
    renderTiers();
    expect(screen.queryByRole("button", { name: /soutenir \d+ € par mois/i })).toBeNull();
  });

  it("un unique CTA « Je soutiens » ouvre le formulaire sécurisé", async () => {
    renderTiers();
    const ctas = screen.getAllByRole("button", { name: /je soutiens/i });
    expect(ctas).toHaveLength(1);
    await userEvent.click(ctas[0]!);
    expect(screen.getByTitle(/formulaire de don helloasso/i)).toBeInTheDocument();
  });
});
