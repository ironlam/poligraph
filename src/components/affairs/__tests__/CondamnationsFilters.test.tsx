import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CondamnationsFilters } from "@/components/affairs/CondamnationsFilters";

const parties = [{ slug: "rn", shortName: "RN", name: "Rassemblement national" }];

describe("CondamnationsFilters", () => {
  it("offers the certainty filter in the list view", () => {
    render(
      <CondamnationsFilters current={{ certainty: "tous", view: "list" }} parties={parties} />
    );
    expect(screen.getByRole("radiogroup", { name: "Niveau de décision" })).toBeInTheDocument();
  });

  // #957: the per-party rate counts final convictions only, so a certainty
  // choice there would change nothing on screen.
  it("hides the certainty filter in the per-party rate view", () => {
    render(
      <CondamnationsFilters current={{ certainty: "prononcee", view: "stats" }} parties={parties} />
    );
    expect(screen.queryByRole("radiogroup", { name: "Niveau de décision" })).toBeNull();
  });

  // The rate table already lists every party, each row linking to its convictions.
  it("hides the party filter in the per-party rate view", () => {
    render(
      <CondamnationsFilters current={{ certainty: "tous", view: "stats" }} parties={parties} />
    );
    expect(screen.queryByText("Filtrer par parti")).toBeNull();
  });

  it("drops the party from the link to the per-party rate view", () => {
    render(
      <CondamnationsFilters
        current={{ certainty: "tous", view: "list", parti: "rn" }}
        parties={parties}
      />
    );
    const statsLink = screen.getByRole("radio", { name: "Taux par parti" });
    expect(statsLink.getAttribute("href")).toBe("/affaires/condamnations?view=stats");
  });

  it("drops certainty from the link to the per-party rate view", () => {
    render(
      <CondamnationsFilters current={{ certainty: "prononcee", view: "list" }} parties={parties} />
    );
    const statsLink = screen.getByRole("radio", { name: "Taux par parti" });
    expect(statsLink.getAttribute("href")).toBe("/affaires/condamnations?view=stats");
  });
});
