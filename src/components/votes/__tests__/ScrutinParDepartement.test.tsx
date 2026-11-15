import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ScrutinParDepartement } from "../ScrutinParDepartement";

const finistere = {
  code: "29",
  name: "Finistère",
  slug: "finistere",
  pour: 0,
  contre: 6,
  abstention: 1,
  nonVotant: 0,
};

describe("ScrutinParDepartement", () => {
  it("ne rend rien sans position enregistrée", () => {
    expect(
      render(<ScrutinParDepartement departements={[]} chamber="AN" />).container.innerHTML
    ).toBe("");
  });

  it("replie la liste et relie chaque département à sa page Territoires", () => {
    const { container } = render(<ScrutinParDepartement departements={[finistere]} chamber="AN" />);
    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary h2")?.textContent).toBe("Le vote par département");
    const lien = container.querySelector("li a")!;
    expect(lien.getAttribute("href")).toBe("/territoires/departements/finistere");
    expect(lien.textContent).toBe("Finistère (29)");
    expect(container.querySelector("li")?.textContent).toContain("6 contre, 1 abstention");
  });

  it("nomme les élus selon la chambre", () => {
    expect(
      render(<ScrutinParDepartement departements={[finistere]} chamber="SENAT" />).container
        .textContent
    ).toContain("des sénateurs");
  });
});
