import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BandeauFilAriane, BandeauSurtitre } from "@/components/ui/RubriqueBandeau";

describe("bandeau de rubrique sur mobile", () => {
  it("ne garde visible que l'étape parente du fil d'Ariane, toutes restant dans le HTML", () => {
    render(
      <BandeauFilAriane
        items={[{ label: "Élections", href: "/elections" }, { label: "Présidentielle 2027" }]}
      />
    );
    const items = screen.getByLabelText("Fil d'Ariane").querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0]?.className).toContain("max-sm:hidden");
    expect(items[1]?.className).not.toContain("max-sm:hidden");
    expect(items[2]?.className).toContain("max-sm:hidden");
    expect(screen.getByRole("link", { name: /Élections/ })).toHaveAttribute("href", "/elections");
  });

  it("réserve le surtitre aux écrans à partir de sm", () => {
    render(<BandeauSurtitre>Politiques</BandeauSurtitre>);
    expect(screen.getByText("Politiques").className).toContain("hidden");
    expect(screen.getByText("Politiques").className).toContain("sm:inline-flex");
  });
});
