import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { FilEvenement } from "@/lib/data/territoire-fil";
import { dateCourte, FilTerritoire } from "../FilTerritoire";

const evenement = (n: number): FilEvenement => ({
  id: `ev-${n}`,
  date: `2026-10-0${n}`,
  evenement: { type: "CHANGEMENT_MAIRE", nom: `Élue ${n}`, predecesseur: null },
  source: { label: "Répertoire national des élus", url: "https://www.data.gouv.fr/rne" },
});

describe("FilTerritoire", () => {
  it("ne rend rien quand le fil est vide", () => {
    expect(render(<FilTerritoire evenements={[]} />).container.innerHTML).toBe("");
  });

  it("rend trois lignes au plus, chacune avec date, phrase et source", () => {
    const { container } = render(<FilTerritoire evenements={[1, 2, 3, 4].map(evenement)} />);
    const lignes = [...container.querySelectorAll("li")];
    expect(lignes).toHaveLength(3);
    const premiere = lignes[0]!;
    expect(premiere.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-01");
    expect(premiere.querySelector("time")?.textContent).toBe("1er oct. 2026");
    expect(premiere.textContent).toContain("Élue 1 devient maire.");
    const lien = premiere.querySelector("a")!;
    expect(lien.getAttribute("href")).toBe("https://www.data.gouv.fr/rne");
    expect(lien.getAttribute("rel")).toBe("noopener noreferrer");
    expect(lien.textContent).toContain("(nouvel onglet)");
  });

  it("titre la section et la relie à son titre", () => {
    const { container } = render(<FilTerritoire evenements={[evenement(1)]} />);
    const section = container.querySelector("section")!;
    const titre = container.querySelector("h2")!;
    expect(titre.textContent).toBe("Dernières nouvelles");
    expect(section.getAttribute("aria-labelledby")).toBe(titre.id);
  });
});

describe("dateCourte", () => {
  it("écrit le jour, le mois abrégé et l'année", () => {
    expect(dateCourte("2026-11-12")).toBe("12 nov. 2026");
    expect(dateCourte("2027-03-01")).toBe("1er mars 2027");
  });
});
