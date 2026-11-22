import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RAPPORT_CRC_REPONSE } from "@/config/juridictions-financieres";
import type { FilEvenement } from "@/lib/data/territoire-fil";
import { FilTerritoire } from "../FilTerritoire";
import { RapportsCrc } from "../RapportsCrc";

const rapport = (n: number, juridictionId = 143): FilEvenement => ({
  id: `r-${n}`,
  date: `2026-11-0${n}`,
  evenement: {
    type: "RAPPORT_CRC",
    juridictionId,
    document: "RAPPORT_OBSERVATIONS_DEFINITIVES",
    collectivite: "Département de la Meuse",
    cahier: null,
    titre: `Département de la Meuse - thème ${n}`,
  },
  source: {
    label: "Chambre régionale des comptes Grand Est",
    url: `https://www.ccomptes.fr/fr/publications/meuse-${n}`,
  },
});

describe("RapportsCrc", () => {
  it("ne rend rien sans rapport publié", () => {
    expect(render(<RapportsCrc rapports={[]} />).container.innerHTML).toBe("");
  });

  it("rend la phrase du gabarit, le lien officiel et la mention de réponse", () => {
    const { container } = render(<RapportsCrc rapports={[rapport(1)]} />);
    expect(container.querySelector("h2")?.textContent).toBe(
      "Rapports de la chambre régionale des comptes"
    );
    expect(container.textContent).toContain(
      "La chambre régionale des comptes Grand Est a publié un rapport sur le département de la Meuse."
    );
    expect(container.textContent).not.toContain("thème");
    const lien = container.querySelector('a[href^="https://www.ccomptes.fr"]')!;
    expect(lien.getAttribute("href")).toBe("https://www.ccomptes.fr/fr/publications/meuse-1");
    expect(lien.getAttribute("rel")).toBe("noopener noreferrer");
    expect(lien.textContent).toContain("nouvel onglet");
    expect(container.textContent).toContain(RAPPORT_CRC_REPONSE);
    expect(
      container.querySelector('a[href="/territoires/methode/rapports-des-chambres-des-comptes"]')
    ).not.toBeNull();
  });

  it("montre trois rapports et replie les suivants", () => {
    const { container } = render(<RapportsCrc rapports={[1, 2, 3, 4, 5].map((n) => rapport(n))} />);
    const details = container.querySelector("details")!;
    expect(details.querySelector("summary")?.textContent).toContain("2 rapports plus anciens");
    expect(details.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelectorAll("li")).toHaveLength(5);
  });

  it("ne replie rien à trois rapports", () => {
    const { container } = render(<RapportsCrc rapports={[1, 2, 3].map((n) => rapport(n))} />);
    expect(container.querySelector("details")).toBeNull();
  });

  it("nomme la chambre territoriale quand tous les rapports en viennent", () => {
    const { container } = render(<RapportsCrc rapports={[rapport(1, 145)]} />);
    expect(container.querySelector("h2")?.textContent).toBe(
      "Rapports de la chambre territoriale des comptes"
    );
  });
});

describe("FilTerritoire, rapport de chambre des comptes", () => {
  it("ajoute la mention de réponse à la ligne du rapport seulement", () => {
    const maire: FilEvenement = {
      id: "m",
      date: "2026-10-01",
      evenement: { type: "CHANGEMENT_MAIRE", nom: "Claire Martin", predecesseur: null },
      source: { label: "RNE", url: "https://www.data.gouv.fr/rne" },
    };
    const { container } = render(<FilTerritoire evenements={[rapport(1), maire]} />);
    const [ligneRapport, ligneMaire] = [...container.querySelectorAll("li")];
    expect(ligneRapport?.textContent).toContain(RAPPORT_CRC_REPONSE);
    expect(ligneMaire?.textContent).not.toContain(RAPPORT_CRC_REPONSE);
  });
});
