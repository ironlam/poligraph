import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ElectedByConstituency } from "../ElectedByConstituency";
import { elected } from "./results-fixtures";

describe("ElectedByConstituency", () => {
  it("regroupe par circonscription avec un titre par circonscription", () => {
    render(
      <ElectedByConstituency
        elected={[
          elected(),
          elected({
            constituencyCode: "08",
            constituencyName: "Ardennes",
            name: "Marc LAMÉNIE",
            politicianSlug: "marc-lamenie",
            gender: "M",
            round: 2,
          }),
        ]}
      />
    );
    expect(screen.getByRole("heading", { level: 3, name: "Ain" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Ardennes" })).toBeInTheDocument();
  });

  it("met un lien vers la fiche seulement si elle est connue", () => {
    render(
      <ElectedByConstituency
        elected={[
          elected(),
          elected({
            name: "Paul MOUGENOT",
            politicianId: null,
            politicianSlug: null,
            status: "unresolved",
            gender: "M",
          }),
        ]}
      />
    );
    expect(screen.getByRole("link", { name: "Véronique BAUDE" })).toHaveAttribute(
      "href",
      "/politiques/veronique-baude"
    );
    expect(screen.queryByRole("link", { name: "Paul MOUGENOT" })).not.toBeInTheDocument();
    expect(screen.getByText("Paul MOUGENOT")).toBeInTheDocument();
  });

  it("accorde le badge au genre et n'en met aucun à un élu non rattaché", () => {
    render(
      <ElectedByConstituency
        elected={[
          elected(),
          elected({
            name: "Jean NOUVEAU",
            politicianSlug: "jean",
            status: "newcomer",
            gender: "M",
          }),
          elected({
            name: "Paul MOUGENOT",
            politicianId: null,
            politicianSlug: null,
            status: "unresolved",
            gender: "M",
          }),
        ]}
      />
    );
    expect(screen.getByText("Réélue")).toBeInTheDocument();
    expect(screen.getByText("Nouveau")).toBeInTheDocument();
    expect(screen.getAllByText(/^(Réélue?|Nouveau|Nouvelle)$/)).toHaveLength(2);
  });

  it("accorde « élue au second tour » pour une sénatrice", () => {
    render(<ElectedByConstituency elected={[elected({ round: 2, gender: "F" })]} />);
    expect(screen.getByText(/élue au second tour/)).toBeInTheDocument();
  });

  it("garde « élu au second tour » pour un sénateur", () => {
    render(<ElectedByConstituency elected={[elected({ round: 2, gender: "M" })]} />);
    expect(screen.getByText(/élu au second tour/)).toBeInTheDocument();
  });

  it("affiche le numéro du département, sauf pour les Français de l'étranger", () => {
    const { container } = render(
      <ElectedByConstituency
        elected={[
          elected(),
          elected({
            constituencyCode: "ZZ",
            constituencyName: "Français établis hors de France",
            name: "Jean ÉTRANGER",
          }),
        ]}
      />
    );
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(container.textContent).not.toContain("ZZ");
    // The number stays out of the heading's accessible name.
    expect(screen.getByRole("heading", { level: 3, name: "Ain" })).toBeInTheDocument();
  });

  it("dessine la forme seulement pour une circonscription qui en a une", () => {
    render(
      <ElectedByConstituency
        elected={[
          elected(),
          elected({ constituencyCode: "973", constituencyName: "Guyane", name: "Marie X" }),
        ]}
        outlines={{ "01": "M0 0L10 10Z" }}
      />
    );
    const outlines = screen.getAllByTestId("department-outline");
    expect(outlines).toHaveLength(1);
    expect(outlines[0]!.querySelector("path")).toHaveAttribute("d", "M0 0L10 10Z");
  });
});
