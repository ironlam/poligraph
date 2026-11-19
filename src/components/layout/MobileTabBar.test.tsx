import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileMenuProvider } from "./MobileMenuProvider";
import { MobileTabBar } from "./MobileTabBar";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

beforeEach(() => {
  route.pathname = "/";
});

function renderBar() {
  return render(
    <MobileMenuProvider>
      <MobileTabBar />
    </MobileMenuProvider>
  );
}

describe("MobileTabBar", () => {
  it("links the four sections to their existing pages", () => {
    renderBar();
    const nav = screen.getByRole("navigation", { name: "Navigation rapide" });
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/politiques",
      "/parlement/votes",
      "/affaires",
      "/elections/presidentielle-2027",
    ]);
  });

  it("marks no tab as current on the homepage", () => {
    renderBar();
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });

  it("marks the tab of the section being read", () => {
    route.pathname = "/affaires/condamnations";
    renderBar();
    expect(screen.getByRole("link", { name: "Affaires" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Élus" })).not.toHaveAttribute("aria-current");
  });

  it("names the tab whose label is only a year", () => {
    renderBar();
    expect(screen.getByRole("link", { name: "Présidentielle 2027" })).toHaveTextContent("2027");
  });

  it("opens and closes the menu from the fifth tab", () => {
    renderBar();
    const button = screen.getByRole("button", { name: "Ouvrir le menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "mobile-menu");

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Fermer le menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("stays out of the admin console", () => {
    route.pathname = "/admin/affaires";
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });

  it("sets the presidential tab apart by a filled pill and a bold label, and only that tab", () => {
    renderBar();
    const nav = screen.getByRole("navigation", { name: "Navigation rapide" });
    const pills = nav.querySelectorAll("a .bg-brand");
    expect(pills).toHaveLength(1);

    const tab = screen.getByRole("link", { name: "Présidentielle 2027" });
    expect(tab).toContainElement(pills[0] as HTMLElement);
    expect(tab.querySelector("span.font-bold")).toHaveTextContent("2027");

    // The flag is decoration: it must not change the tab's spoken name.
    const flags = screen.getAllByTestId("tab-flag");
    expect(flags).toHaveLength(1);
    expect(tab).toContainElement(flags[0] as HTMLElement);
    expect(flags[0]).toHaveAttribute("aria-hidden", "true");
    expect(tab).toHaveAccessibleName("Présidentielle 2027");
  });
});
