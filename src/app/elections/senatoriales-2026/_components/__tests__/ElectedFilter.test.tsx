import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ElectedFilter } from "../ElectedFilter";
import { elected } from "./results-fixtures";

const list = [
  elected(),
  elected({ constituencyCode: "09", constituencyName: "Ariège", name: "Jean ARIÉGEOIS" }),
  elected({ constituencyCode: "2A", constituencyName: "Corse-du-Sud", name: "Paul CORSE" }),
];

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Chercher un département"), { target: { value } });
}

describe("ElectedFilter", () => {
  it("montre toutes les circonscriptions tant que rien n'est tapé", () => {
    render(<ElectedFilter elected={list} outlines={{}} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.getByText("3 circonscriptions")).toBeInTheDocument();
  });

  it("filtre par nom sans accent et annonce le compte", () => {
    render(<ElectedFilter elected={list} outlines={{}} />);
    type("ariege");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Ariège",
    ]);
    expect(screen.getByText("1 circonscription sur 3")).toBeInTheDocument();
  });

  it("filtre par numéro", () => {
    render(<ElectedFilter elected={list} outlines={{}} />);
    type("2a");
    expect(screen.getByRole("heading", { level: 3, name: "Corse-du-Sud" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Ain" })).not.toBeInTheDocument();
  });

  it("dit quoi faire quand rien ne correspond", () => {
    render(<ElectedFilter elected={list} outlines={{}} />);
    type("bretagne");
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(
      screen.getByText(/Aucune circonscription ne correspond à « bretagne »/)
    ).toBeInTheDocument();
  });
});
