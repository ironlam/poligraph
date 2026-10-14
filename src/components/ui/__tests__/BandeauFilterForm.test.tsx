import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BandeauFilterForm } from "@/components/ui/BandeauFilterForm";

describe("BandeauFilterForm", () => {
  it("nomme le bouton réduit à une icône et lie chaque liste à son libellé", () => {
    render(
      <BandeauFilterForm
        action="/affaires"
        idPrefix="affaires"
        searchPlaceholder="Nom"
        selects={[{ name: "parti", label: "Parti", options: [{ value: "", label: "Tous" }] }]}
      />
    );
    const button = screen.getByRole("button", { name: "Rechercher" });
    expect(button).toHaveAttribute("aria-label", "Rechercher");
    expect(button).toHaveAttribute("title", "Rechercher");
    expect(screen.getByLabelText("Parti")).toHaveAttribute("name", "parti");
  });
});
