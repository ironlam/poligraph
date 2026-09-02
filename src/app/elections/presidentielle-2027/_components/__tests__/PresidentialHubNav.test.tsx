import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PresidentialHubNav } from "../PresidentialHubNav";

describe("PresidentialHubNav", () => {
  it("relie les trois entrées utiles du hub et expose la page courante", () => {
    render(<PresidentialHubNav active="candidates" />);

    expect(
      screen.getByRole("navigation", { name: "Explorer la présidentielle 2027" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Vue d’ensemble" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );
    expect(screen.getByRole("link", { name: "Thématiques" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes"
    );
    expect(screen.getByRole("link", { name: "Candidatures" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
