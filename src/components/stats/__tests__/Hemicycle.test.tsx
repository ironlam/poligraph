import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Hemicycle } from "../Hemicycle";
import type { HemicycleGroup, HemicycleDeputy } from "@/lib/data/hemicycle";

function deputy(over: Partial<HemicycleDeputy> & { id: string }): HemicycleDeputy {
  return {
    slug: `d-${over.id}`,
    firstName: "Jean",
    lastName: `Nom${over.id}`,
    severityScore: 0,
    maxCertaintyLevel: null,
    activeAffairCount: 0,
    ...over,
  };
}

/** Two groups: RED has one convicted and one accused, BLUE has nobody. */
const groups: HemicycleGroup[] = [
  {
    code: "RED",
    name: "Groupe Rouge",
    shortName: "RGE",
    color: "#ff0000",
    politicalPosition: null,
    deputies: [
      deputy({ id: "1", severityScore: 8, maxCertaintyLevel: "ETABLI", activeAffairCount: 2 }),
      deputy({ id: "2", severityScore: 2, maxCertaintyLevel: "EN_COURS", activeAffairCount: 1 }),
      deputy({ id: "3" }),
    ],
  },
  {
    code: "BLUE",
    name: "Groupe Bleu",
    shortName: "BLU",
    color: "#0000ff",
    politicalPosition: null,
    deputies: [deputy({ id: "4" }), deputy({ id: "5" })],
  },
];

/** The visible summary line, screen-reader table excluded. */
function summary() {
  return screen.getByTestId("hemicycle-summary").textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("Hemicycle summary", () => {
  it("rend chaque siège occupé accessible au clavier", () => {
    const { container } = render(<Hemicycle groups={groups} />);
    const links = container.querySelectorAll('svg a[href^="/politiques/"]');

    expect(links).toHaveLength(5);
    expect([...links].map((link) => link.getAttribute("aria-label"))).toContain(
      "Voir la fiche de Jean Nom1"
    );
  });

  it("counts the whole chamber when no group is selected", () => {
    render(<Hemicycle groups={groups} />);

    expect(summary()).toContain("2 députés mis en cause");
    expect(summary()).toContain("sur 5");
    expect(summary()).toContain("1 condamné");
  });

  it("counts only the selected group and names it", () => {
    render(<Hemicycle groups={groups} />);

    fireEvent.click(screen.getByRole("button", { name: /RGE/ }));

    expect(summary()).toContain("RGE");
    expect(summary()).toContain("2 députés");
    expect(summary()).toContain("sur 3");
    expect(summary()).toContain("1 condamné");
  });

  it("reads correctly for a group with nobody in trouble", () => {
    render(<Hemicycle groups={groups} />);

    fireEvent.click(screen.getByRole("button", { name: /BLU/ }));

    expect(summary()).toContain("BLU");
    expect(summary()).toContain("0 député");
    expect(summary()).toContain("sur 2");
    // Nothing to say about convictions when there are none.
    expect(summary()).not.toContain("condamné");
  });

  it("offers a way back to the whole chamber", () => {
    render(<Hemicycle groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: /RGE/ }));

    fireEvent.click(screen.getByRole("button", { name: /tous les groupes/i }));

    expect(summary()).toContain("sur 5");
    expect(screen.queryByRole("button", { name: /tous les groupes/i })).toBeNull();
  });

  it("announces the selected group to assistive technology", () => {
    render(<Hemicycle groups={groups} />);
    const legend = screen.getByRole("button", { name: /RGE/ });

    expect(legend).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(legend);
    expect(legend).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the screen-reader table on the whole chamber", () => {
    render(<Hemicycle groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: /RGE/ }));

    // The table is a full data alternative to the chart, not a view of it.
    const table = screen.getByRole("table");
    expect(within(table).getByText("BLU")).toBeInTheDocument();
  });
});
