import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const usePathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname }));

const { ReportLink } = await import("../ReportLink");

describe("ReportLink", () => {
  it("joint la page courante, encodée", () => {
    usePathname.mockReturnValue("/politiques/yael-braun-pivet");
    render(<ReportLink />);
    expect(screen.getByRole("link", { name: "Signaler une erreur" })).toHaveAttribute(
      "href",
      "/signaler?from=%2Fpolitiques%2Fyael-braun-pivet"
    );
  });

  it("n'ajoute rien quand le chemin est inconnu ou que l'on est déjà sur le formulaire", () => {
    usePathname.mockReturnValue(null);
    const { rerender } = render(<ReportLink />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/signaler");
    usePathname.mockReturnValue("/signaler");
    rerender(<ReportLink />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/signaler");
  });
});
