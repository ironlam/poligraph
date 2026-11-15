import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommuneTerritoireLink } from "../CommuneTerritoireLink";

describe("CommuneTerritoireLink", () => {
  it("mène à la page Territoires de la commune et dit où il mène", () => {
    render(<CommuneTerritoireLink inseeCode="2A004" name="Ajaccio" />);
    expect(screen.getByRole("heading", { name: "Le dossier de la commune" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir Ajaccio dans Territoires" })).toHaveAttribute(
      "href",
      "/territoires/communes/ajaccio-2A004"
    );
  });

  it("ne promet ni conseil, ni intercommunalité, ni décisions", () => {
    const { container } = render(<CommuneTerritoireLink inseeCode="11069" name="Carcassonne" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/conseil/i);
    expect(text).not.toMatch(/intercommunalit/i);
    expect(text).not.toMatch(/décision/i);
  });
});
