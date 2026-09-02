import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home, MapPin } from "lucide-react";

const mocks = vi.hoisted(() => ({ pathname: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));
vi.mock("../CommuneSearch", () => ({
  CommuneSearch: (props: { basePath?: string; label?: string; placeholder?: string }) => (
    <div
      data-testid="commune-search"
      data-base-path={props.basePath ?? ""}
      data-label={props.label ?? ""}
      data-placeholder={props.placeholder ?? ""}
    />
  ),
}));

import { MunicipalesYearNav, type MunicipalesTab } from "../MunicipalesYearNav";

const TABS: MunicipalesTab[] = [
  { href: "/elections/municipales-2020", label: "Résultats", icon: Home, exact: true },
  { href: "/elections/municipales-2020/departements", label: "Départements", icon: MapPin },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname.mockReturnValue("/elections/municipales-2020");
});

describe("MunicipalesYearNav", () => {
  it("renders one link per tab", () => {
    render(<MunicipalesYearNav tabs={TABS} search={{}} />);

    expect(screen.getByRole("link", { name: "Résultats" })).toHaveAttribute(
      "href",
      "/elections/municipales-2020"
    );
    expect(screen.getByRole("link", { name: "Départements" })).toHaveAttribute(
      "href",
      "/elections/municipales-2020/departements"
    );
  });

  it("marks the current tab for assistive technology", () => {
    render(<MunicipalesYearNav tabs={TABS} search={{}} />);
    expect(screen.getByRole("link", { name: "Résultats" })).toHaveAttribute("aria-current", "page");
  });

  it("matches an exact tab only on its own path", () => {
    // Without `exact`, the section root would stay highlighted on every child page.
    mocks.pathname.mockReturnValue("/elections/municipales-2020/departements");
    render(<MunicipalesYearNav tabs={TABS} search={{}} />);

    expect(screen.getByRole("link", { name: "Résultats" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Départements" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("matches a non-exact tab by prefix", () => {
    mocks.pathname.mockReturnValue("/elections/municipales-2020/departements/34");
    render(<MunicipalesYearNav tabs={TABS} search={{}} />);

    expect(screen.getByRole("link", { name: "Départements" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("keeps the search panel closed until the toggle is pressed", async () => {
    render(<MunicipalesYearNav tabs={TABS} search={{}} />);

    const toggle = screen.getByRole("button", { name: "Rechercher une commune" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("commune-search")).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("commune-search")).toBeInTheDocument();
  });

  it("hands the year's search configuration to CommuneSearch", async () => {
    render(
      <MunicipalesYearNav
        tabs={TABS}
        search={{ basePath: "/elections/municipales-2020", label: "Résultats dans ma commune" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Rechercher une commune" }));

    const search = screen.getByTestId("commune-search");
    expect(search).toHaveAttribute("data-base-path", "/elections/municipales-2020");
    expect(search).toHaveAttribute("data-label", "Résultats dans ma commune");
    expect(search).toHaveAttribute("data-placeholder", "Rechercher une commune...");
  });

  it("lets a caller override the placeholder", async () => {
    render(<MunicipalesYearNav tabs={TABS} search={{ placeholder: "Votre commune" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Rechercher une commune" }));

    expect(screen.getByTestId("commune-search")).toHaveAttribute(
      "data-placeholder",
      "Votre commune"
    );
  });

  it("does not submit a surrounding form", () => {
    render(<MunicipalesYearNav tabs={TABS} search={{}} />);
    expect(screen.getByRole("button", { name: "Rechercher une commune" })).toHaveAttribute(
      "type",
      "button"
    );
  });
});
