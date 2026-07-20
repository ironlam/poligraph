import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DonationDialogProvider, useDonationDialog } from "./DonationDialogProvider";

vi.mock("@/lib/umami", () => ({ trackUmami: vi.fn() }));
import { trackUmami } from "@/lib/umami";

function Trigger() {
  const { open } = useDonationDialog();
  return (
    <button type="button" onClick={() => open("monthly")}>
      Je soutiens
    </button>
  );
}

describe("DonationDialogProvider", () => {
  it("ne monte pas l'iframe avant ouverture", () => {
    render(
      <DonationDialogProvider source="support-page">
        <Trigger />
      </DonationDialogProvider>
    );
    expect(screen.queryByTitle(/formulaire de don helloasso/i)).toBeNull();
  });
  it("ouvre la modale et monte l'iframe au clic, et track l'event", async () => {
    render(
      <DonationDialogProvider source="support-page">
        <Trigger />
      </DonationDialogProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: /je soutiens/i }));
    expect(screen.getByTitle(/formulaire de don helloasso/i)).toBeInTheDocument();
    expect(trackUmami).toHaveBeenCalledWith("donation_dialog_open", {
      source: "support-page",
      intent: "monthly",
    });
  });
  it("se ferme via le bouton Fermer", async () => {
    render(
      <DonationDialogProvider source="support-page">
        <Trigger />
      </DonationDialogProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: /je soutiens/i }));
    await userEvent.click(screen.getByRole("button", { name: /fermer/i }));
    expect(screen.queryByTitle(/formulaire de don helloasso/i)).toBeNull();
  });
});
