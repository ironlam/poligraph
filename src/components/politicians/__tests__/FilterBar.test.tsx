import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    updateParams: vi.fn(),
    searchParams: new URLSearchParams(),
    isPending: false,
  }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterBar } from "@/components/politicians/FilterBar";

describe("FilterBar", () => {
  it("affiche le filtre Eurodéputés actif quand la tuile y mène", () => {
    render(
      <TooltipProvider>
        <FilterBar
          currentSort="prominence"
          currentMandate="depute_europeen"
          currentConviction={false}
          convictionCount={0}
          currentFinancing={false}
          financingCount={0}
          counts={{
            deputes: 574,
            senateurs: 350,
            eurodeputes: 81,
            gouvernement: 30,
            dirigeants: 12,
            maires: 34803,
          }}
        />
      </TooltipProvider>
    );
    const select = screen.getByLabelText("Mandat:") as HTMLSelectElement;
    expect(select.value).toBe("depute_europeen");
    expect(select.selectedOptions[0]).toHaveTextContent("Eurodéputés (81)");
  });
});
