import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FOLLOW_LINKS } from "@/config/navigation";
import { MobileMenu } from "./MobileMenu";
import { MobileMenuProvider } from "./MobileMenuProvider";
import { MobileTabBar } from "./MobileTabBar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/search", () => ({
  useCommandPalette: () => ({ open: vi.fn(), openWithBack: vi.fn() }),
}));
vi.mock("@/components/theme/MobileThemeToggle", () => ({ MobileThemeToggle: () => null }));
vi.mock("@/components/ui/PageShareButton", () => ({ PageShareButton: () => null }));

function openMenu() {
  render(
    <MobileMenuProvider>
      <MobileMenu enabledFlags={[]} />
      <MobileTabBar />
    </MobileMenuProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
  return within(screen.getByRole("dialog", { name: "Menu de navigation" }));
}

describe("MobileMenu : suivre Poligraph", () => {
  it("nomme chaque compte au survol comme au lecteur d'écran, et ouvre un nouvel onglet", () => {
    const menu = openMenu();

    expect(FOLLOW_LINKS.length).toBeGreaterThan(1);
    for (const account of FOLLOW_LINKS) {
      const link = menu.getByRole("link", {
        name: `${account.label} (s'ouvre dans un nouvel onglet)`,
      });
      expect(link).toHaveAttribute("href", account.href);
      expect(link).toHaveAttribute("title", account.label);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("laisse GitHub au pied de page", () => {
    const menu = openMenu();

    expect(menu.queryByRole("link", { name: /github/i })).toBeNull();
  });
});

describe("MobileMenu : élections", () => {
  it("renvoie vers la page des élections au lieu d'en lister trois", () => {
    const menu = openMenu();

    expect(menu.getByRole("link", { name: /toutes les élections/i })).toHaveAttribute(
      "href",
      "/elections"
    );
    expect(menu.queryByRole("link", { name: /sénatoriales 2026/i })).toBeNull();
    expect(menu.queryByRole("link", { name: /municipales 2026/i })).toBeNull();
    expect(menu.queryByText("À venir")).toBeNull();
  });
});
