import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BandeauFilterForm } from "@/components/ui/BandeauFilterForm";

describe("BandeauFilterForm", () => {
  it("place le bouton de validation après les filtres et lie chaque liste à son libellé", () => {
    render(
      <BandeauFilterForm
        action="/affaires"
        idPrefix="affaires"
        searchPlaceholder="Nom"
        selects={[
          { name: "parti", label: "Parti", options: [{ value: "", label: "Tous" }] },
          { name: "sort", label: "Tri", options: [{ value: "", label: "Récent" }] },
        ]}
      />
    );
    const button = screen.getByRole("button", { name: "Rechercher" });
    expect(screen.getByLabelText("Parti")).toHaveAttribute("name", "parti");

    const fields = Array.from(
      button.closest("form")!.querySelectorAll("input, select, button")
    ).map((el) => el.getAttribute("name") ?? el.getAttribute("type"));
    expect(fields).toEqual(["search", "parti", "sort", "submit"]);
  });
});
