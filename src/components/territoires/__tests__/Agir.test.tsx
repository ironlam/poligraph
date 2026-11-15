import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Agir } from "../Agir";

const hors = (container: HTMLElement) => {
  const clone = container.cloneNode(true) as HTMLElement;
  // What stays on screen while every way is folded: all but the content under each summary.
  clone.querySelectorAll("details > :not(summary)").forEach((el) => el.remove());
  return clone.textContent ?? "";
};

describe("Agir", () => {
  it("replie chaque voie derrière une ligne, le tribunal du territoire sur celle du recours", () => {
    const { container } = render(<Agir departmentCode="29" />);
    const voies = [...container.querySelectorAll("li > details")];
    expect(voies).toHaveLength(6);
    expect(voies.filter((d) => d.hasAttribute("open"))).toHaveLength(0);
    expect(voies.map((d) => d.querySelector("summary")?.textContent)).toEqual([
      "Assister au conseil municipal",
      "Obtenir un document",
      "Contacter la mairie",
      "Demander une consultation",
      "S'inscrire pour voter",
      "Contester une décisiontribunal administratif siégeant à Rennes",
    ]);
    // Folded, the block shows no legal text and no link, only the lines and the warning.
    const replie = hors(container);
    expect(replie).not.toContain("Les séances du conseil municipal sont publiques.");
    expect(replie).toContain("ne remplace pas un conseil juridique");
    // Every text and every source is still in the page, inside its line.
    for (const details of voies) {
      expect(details.querySelector("p")?.textContent).toBeTruthy();
      expect(details.querySelectorAll("a[href^='https://']").length).toBeGreaterThan(0);
    }
    expect(voies.at(-1)?.textContent).toContain("en principe celui qui siège à Rennes.");
  });

  it("ne nomme aucun tribunal sur la ligne d'une région", () => {
    const { container } = render(<Agir niveau="region" />);
    const recours = [...container.querySelectorAll("summary")].at(-1);
    expect(recours?.textContent).toBe("Contester une décision");
  });
});
