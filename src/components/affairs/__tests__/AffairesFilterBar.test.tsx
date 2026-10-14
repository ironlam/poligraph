import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const { updateParams } = vi.hoisted(() => ({ updateParams: vi.fn() }));

vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    updateParams,
    searchParams: new URLSearchParams(),
    isPending: false,
  }),
}));

import { AffairesFilterBar } from "@/components/affairs/AffairesFilterBar";

const parties = [{ slug: "rn", shortName: "RN", name: "Rassemblement National", count: 5 }];
const emptyFilters = {
  search: "",
  sort: "",
  certainty: "",
  parti: "",
  category: "",
  supercat: "",
};
const baseProps = {
  mode: "mise-en-cause" as const,
  currentFilters: emptyFilters,
  parties,
  certaintyCounts: {},
  superCounts: {},
};

describe("AffairesFilterBar", () => {
  beforeEach(() => updateParams.mockClear());

  it("renders certainty as a radiogroup with per-level counts", () => {
    render(<AffairesFilterBar {...baseProps} certaintyCounts={{ ETABLI: 3, EN_COURS: 7 }} />);
    const group = screen.getByRole("radiogroup", { name: "Certitude" });
    expect(
      within(group).getByRole("radio", { name: "Condamnation définitive (3)" })
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "Procédure en cours (7)" })
    ).toBeInTheDocument();
  });

  it("hides a certainty level with a zero count", () => {
    render(<AffairesFilterBar {...baseProps} certaintyCounts={{ ETABLI: 3 }} />);
    expect(screen.queryByRole("radio", { name: /Procédure en cours/ })).toBeNull();
  });

  it("calls updateParams with the certainty level when a level is clicked", () => {
    render(<AffairesFilterBar {...baseProps} certaintyCounts={{ ETABLI: 3 }} />);
    fireEvent.click(screen.getByRole("radio", { name: "Condamnation définitive (3)" }));
    expect(updateParams).toHaveBeenCalledWith({ certainty: "ETABLI" }, { mode: "replace" });
  });

  it("does not render the 'infraction précise' select until a super-category is active", () => {
    render(<AffairesFilterBar {...baseProps} />);
    expect(screen.queryByLabelText("Infraction précise")).toBeNull();
  });

  it("reveals the 'infraction précise' select once a super-category is selected", () => {
    render(
      <AffairesFilterBar {...baseProps} currentFilters={{ ...emptyFilters, supercat: "PROBITE" }} />
    );
    expect(screen.getByLabelText("Infraction précise")).toBeInTheDocument();
  });

  it("keeps the infraction select usable for a legacy ?category= URL (no supercat)", () => {
    render(
      <AffairesFilterBar
        {...baseProps}
        currentFilters={{ ...emptyFilters, category: "CORRUPTION" }}
      />
    );
    expect(screen.getByLabelText("Infraction précise")).toBeInTheDocument();
  });

  it("calls updateParams with the family code and clears category when a family is clicked", () => {
    render(<AffairesFilterBar {...baseProps} />);
    const group = screen.getByRole("radiogroup", { name: "Catégorie" });
    fireEvent.click(within(group).getByRole("radio", { name: /Atteintes à la probité/ }));
    expect(updateParams).toHaveBeenCalledWith(
      { supercat: "PROBITE", category: "" },
      { mode: "replace" }
    );
  });

  it("renders a Parti select in the panel and calls updateParams on selection", () => {
    render(<AffairesFilterBar {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Parti"), { target: { value: "rn" } });
    expect(updateParams).toHaveBeenCalledWith({ parti: "rn" }, { mode: "replace" });
  });

  it("'Tout effacer' resets search/supercat/category/certainty/parti but never sort", () => {
    render(
      <AffairesFilterBar
        {...baseProps}
        currentFilters={{
          search: "dupont",
          sort: "certainty",
          certainty: "ETABLI",
          parti: "rn",
          category: "CORRUPTION",
          supercat: "PROBITE",
        }}
        certaintyCounts={{ ETABLI: 1 }}
      />
    );
    const clearButtons = screen.getAllByRole("button", { name: "Tout effacer" });
    fireEvent.click(clearButtons[0]!);
    expect(updateParams).toHaveBeenCalledTimes(1);
    const [updates, options] = updateParams.mock.calls[0]!;
    expect(updates).toEqual({
      search: "",
      supercat: "",
      category: "",
      certainty: "",
      parti: "",
    });
    expect(updates).not.toHaveProperty("sort");
    expect(options).toEqual({ mode: "replace" });
  });

  it("does not show a sort chip (sort is excluded from active filter chips)", () => {
    render(
      <AffairesFilterBar {...baseProps} currentFilters={{ ...emptyFilters, sort: "certainty" }} />
    );
    expect(screen.queryByText(/Tri :/)).toBeNull();
  });

  it("does not show a stale Famille chip when supercat contradicts the category", () => {
    render(
      <AffairesFilterBar
        {...baseProps}
        currentFilters={{ ...emptyFilters, supercat: "FINANCES", category: "CORRUPTION" }}
      />
    );
    expect(screen.queryByText("Infractions financières")).toBeNull();
  });

  it("renders the perimeter toggle (AffairModeToggle) inside the panel", () => {
    render(<AffairesFilterBar {...baseProps} />);
    expect(screen.getByRole("group", { name: "Type d'affaires" })).toBeInTheDocument();
  });

  it("applies the manual search only on submit, never while typing", () => {
    render(<AffairesFilterBar {...baseProps} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "dupont" } });
    expect(updateParams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    expect(updateParams).toHaveBeenCalledWith({ search: "dupont" }, { mode: "replace" });
  });
});
