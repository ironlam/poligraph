import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ScrutinOfficialGroups } from "@/components/votes/ScrutinOfficialGroups";
import type { OfficialGroupDisplayRow } from "@/lib/votes/scrutin-provenance";

function row(overrides: Partial<OfficialGroupDisplayRow> = {}): OfficialGroupDisplayRow {
  return {
    organeRef: "PO1",
    label: "Groupe A",
    abbreviation: "GA",
    memberCount: 30,
    forCount: 2,
    againstCount: 26,
    abstainCount: 0,
    nonVoterCount: 1,
    majorityPosition: "CONTRE",
    ...overrides,
  };
}

function renderRows(rows: OfficialGroupDisplayRow[]) {
  return render(
    <ScrutinOfficialGroups view={{ kind: "shown", rows }} source={null} fetchedAt={null} />
  );
}

describe("ScrutinOfficialGroups", () => {
  it("écrit chaque décompte en texte, la barre et les pastilles restent décoratives", () => {
    const { container } = renderRows([row()]);
    const list = screen.getByRole("list", { name: "Décompte officiel par groupe" });
    const counts = [...list.querySelectorAll("[data-count]")].map((item) => item.textContent);
    expect(counts).toEqual(["Pour2", "Contre26", "Abstentions0", "Non-votants1"]);
    for (const bar of container.querySelectorAll('[data-testid="position-count-bar"]')) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("nomme la position majoritaire en toutes lettres, pas par la seule couleur", () => {
    renderRows([row()]);
    const list = screen.getByRole("list", { name: "Décompte officiel par groupe" });
    expect(list.querySelector("[data-majority]")).toHaveTextContent(
      "Position majoritaire : Contre"
    );
    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Groupe",
      "Pour",
      "Contre",
      "Abstentions",
      "Non-votants",
      "Position majoritaire",
    ]);
    const cells = within(table)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["2", "26", "0", "1", "Contre"]);
  });

  it("n'invente ni non-votants ni position majoritaire quand la source n'en publie pas", () => {
    const { container } = renderRows([row({ nonVoterCount: null, majorityPosition: null })]);
    expect(container.querySelector('[data-count="non-votants"]')).toBeNull();
    expect(container.querySelector("[data-majority]")).toBeNull();
  });

  it("applique le même traitement visuel à toutes les positions", () => {
    const { container } = renderRows([
      row({ organeRef: "PO1", majorityPosition: "POUR" }),
      row({ organeRef: "PO2", majorityPosition: "CONTRE" }),
      row({ organeRef: "PO3", majorityPosition: "ABSTENTION" }),
    ]);
    const classes = new Set(
      [...container.querySelectorAll("ul [data-majority]")].map((badge) => badge.className)
    );
    expect(classes.size).toBe(1);
  });
});
