import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    updateParams: vi.fn(),
    searchParams: new URLSearchParams(),
    isPending: false,
  }),
}));

vi.mock("@/components/factchecks/PoliticianFilterAutocomplete", () => ({
  PoliticianFilterAutocomplete: () => null,
}));

import { FactChecksFilterBar } from "@/components/factchecks/FactChecksFilterBar";

const baseProps = {
  currentFilters: { search: "", source: "", verdict: "", politician: "", directOnly: false },
  sources: [{ name: "AFP Factuel", count: 3 }],
  ratingCounts: {},
  politicianContext: null,
};

describe("FactChecksFilterBar", () => {
  it("affiche son champ de recherche par défaut", () => {
    render(<FactChecksFilterBar {...baseProps} />);
    expect(screen.getByLabelText("Recherche")).toBeInTheDocument();
  });

  it("retire son champ de recherche quand le bandeau le porte", () => {
    render(<FactChecksFilterBar {...baseProps} hideSearch />);
    expect(screen.queryByLabelText("Recherche")).toBeNull();
  });
});
