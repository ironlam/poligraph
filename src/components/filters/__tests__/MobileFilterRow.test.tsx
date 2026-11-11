import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileFilterRow } from "@/components/filters/MobileFilterRow";

const trigger = <button type="button">Filtres</button>;

describe("MobileFilterRow", () => {
  it("shows the trigger alone when no filter is active", () => {
    render(
      <MobileFilterRow trigger={trigger} filters={[]} onRemove={() => {}} onClearAll={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Filtres" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtres actifs" })).toBeNull();
  });

  it("keeps the trigger outside of the scrolling group of chips", () => {
    render(
      <MobileFilterRow
        trigger={trigger}
        filters={[{ key: "parti", label: "RN" }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />
    );
    const group = screen.getByRole("group", { name: "Filtres actifs" });
    expect(group).toHaveClass("overflow-x-auto");
    expect(group).not.toContainElement(screen.getByRole("button", { name: "Filtres" }));
    expect(group).toHaveTextContent("RN");
  });

  it("drops the leading label, which the group name already carries", () => {
    render(
      <MobileFilterRow
        trigger={trigger}
        filters={[{ key: "parti", label: "RN" }]}
        onRemove={() => {}}
        onClearAll={() => {}}
      />
    );
    expect(screen.queryByText("Filtres actifs :")).toBeNull();
  });

  it("removes one filter and clears all of them from the row", () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    render(
      <MobileFilterRow
        trigger={trigger}
        filters={[
          { key: "parti", label: "RN" },
          { key: "certainty", label: "Procédure en cours" },
        ]}
        onRemove={onRemove}
        onClearAll={onClearAll}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Retirer le filtre Procédure en cours" }));
    expect(onRemove).toHaveBeenCalledWith("certainty");
    fireEvent.click(screen.getByRole("button", { name: "Tout effacer" }));
    expect(onClearAll).toHaveBeenCalled();
  });
});
