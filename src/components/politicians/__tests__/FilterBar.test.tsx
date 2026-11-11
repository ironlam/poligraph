import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const updateParams = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    updateParams,
    searchParams: new URLSearchParams(),
    isPending: false,
  }),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterBar, type MandateFilter, type SortOption } from "@/components/politicians/FilterBar";

function renderFilterBar(currentSort: SortOption, currentMandate: MandateFilter = "") {
  return render(
    <TooltipProvider>
      <FilterBar
        currentSort={currentSort}
        currentMandate={currentMandate}
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
}

// Par id : le libellé « Tri: » porte aussi l'infobulle du tri par notoriété.
const sortSelect = () => document.getElementById("sort-select") as HTMLSelectElement;

describe("FilterBar", () => {
  beforeEach(() => updateParams.mockClear());

  it("affiche le filtre Eurodéputés actif quand la tuile y mène", () => {
    renderFilterBar("prominence", "depute_europeen");
    const select = screen.getByLabelText("Mandat:") as HTMLSelectElement;
    expect(select.value).toBe("depute_europeen");
    expect(select.selectedOptions[0]).toHaveTextContent("Eurodéputés (81)");
  });

  // La page retombe sur « prominence » quand ?sort= est absent : le tri écrit dans
  // l'URL doit donc être tout sauf celui-là, sinon le choix est perdu au rendu suivant.
  it.each(["alpha", "alpha-desc", "recent"])("écrit le tri %s dans l'URL", (sort) => {
    renderFilterBar("prominence");
    fireEvent.change(sortSelect(), { target: { value: sort } });
    expect(updateParams).toHaveBeenCalledWith({ sort });
  });

  it("retire le paramètre pour le tri par défaut (Notoriété)", () => {
    renderFilterBar("alpha");
    fireEvent.change(sortSelect(), { target: { value: "prominence" } });
    expect(updateParams).toHaveBeenCalledWith({ sort: "" });
  });
});
