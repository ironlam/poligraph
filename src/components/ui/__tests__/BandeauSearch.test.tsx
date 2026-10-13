import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BandeauSearch } from "@/components/ui/BandeauSearch";

describe("BandeauSearch", () => {
  it("envoie la requête en GET vers la liste, champ nommé par son label", () => {
    render(
      <BandeauSearch action="/affaires" id="q" label="Rechercher une affaire" placeholder="Nom" />
    );
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/affaires");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("Rechercher une affaire")).toHaveAttribute("name", "search");
  });
});
