import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VotesFilterBar, type VotesFilterBarProps } from "../VotesFilterBar";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";
import { formatLegislature } from "@/lib/votes/legislature";

const mockUpdateParams = vi.fn();

// Mocks both VotesFilterBar's own call and VotesSearchInput's internal call
// (same module). next/navigation is already mocked globally in test/setup.tsx.
vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    searchParams: new URLSearchParams(),
    isPending: false,
    updateParams: mockUpdateParams,
  }),
}));

function baseProps(overrides?: Partial<VotesFilterBarProps>): VotesFilterBarProps {
  return {
    current: { sort: "recent" },
    options: {
      chambers: [
        { chamber: "AN", _count: 100 },
        { chamber: "SENAT", _count: 50 },
      ],
      legislatures: [
        { legislature: 17, _count: 10 },
        { legislature: 2023, _count: 5 },
      ],
      themeCounts: [],
      typeCounts: [],
    },
    ...overrides,
  };
}

describe("VotesFilterBar", () => {
  beforeEach(() => {
    mockUpdateParams.mockClear();
  });

  it("renders all 13 theme categories, never truncated", () => {
    render(<VotesFilterBar {...baseProps()} />);
    const themeCodes = LEGACY_THEME_CATEGORIES;
    expect(themeCodes).toHaveLength(13);
    for (const code of themeCodes) {
      const label = THEME_CATEGORY_LABELS[code];
      expect(screen.getAllByRole("radio", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("calls updateParams with the theme code when a theme is clicked", () => {
    render(<VotesFilterBar {...baseProps()} />);
    const radio = screen.getAllByRole("radio", { name: THEME_CATEGORY_LABELS.SANTE })[0]!;
    fireEvent.click(radio);
    expect(mockUpdateParams).toHaveBeenCalledWith({ theme: "SANTE" }, { mode: "replace" });
  });

  it("'Tout effacer' clears chamber/type/result/legislature/theme/search but never sort", () => {
    render(
      <VotesFilterBar
        {...baseProps({
          current: {
            sort: "close",
            chamber: "AN",
            result: "ADOPTED",
            legislature: 17,
            theme: "SANTE",
            search: "climat",
            type: "amendements",
          },
        })}
      />
    );
    const clearButton = screen.getAllByRole("button", { name: "Tout effacer" })[0]!;
    fireEvent.click(clearButton);

    expect(mockUpdateParams).toHaveBeenCalledTimes(1);
    const [updates, callOptions] = mockUpdateParams.mock.calls[0]!;
    expect(updates).toEqual({
      chamber: "",
      type: "",
      result: "",
      legislature: "",
      theme: "",
      search: "",
    });
    expect(updates).not.toHaveProperty("sort");
    expect(callOptions).toEqual({ mode: "replace" });
  });

  it("shows the formatLegislature label in the legislature select, never a bare 2023e", () => {
    render(<VotesFilterBar {...baseProps()} />);
    const senatLabel = formatLegislature(2023);
    expect(screen.getAllByRole("option", { name: senatLabel }).length).toBeGreaterThan(0);
    expect(screen.queryByText("2023e")).not.toBeInTheDocument();
  });
});
