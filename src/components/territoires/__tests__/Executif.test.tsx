import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Executif } from "../Executif";

const rangs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ rang: i + 1, nom: `Élu ${i + 1}` }));

describe("Executif", () => {
  it("montre cinq rangs et replie les suivants", () => {
    const { container } = render(<Executif titre="Vice-présidence" rangs={rangs(7)} />);
    const details = container.querySelector("details")!;
    const visibles = [...container.querySelectorAll("ol li")].filter((li) => !details.contains(li));
    expect(visibles).toHaveLength(5);
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Voir les 2 suivants");
    expect(details.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("a")).toBeNull();
  });

  it("ne replie rien jusqu'à cinq rangs et accorde le singulier au-delà", () => {
    expect(
      render(<Executif titre="t" rangs={rangs(5)} />).container.querySelector("details")
    ).toBeNull();
    expect(
      render(<Executif titre="t" rangs={rangs(6)} />).container.querySelector("summary")
        ?.textContent
    ).toBe("Voir le suivant");
  });

  it("ne rend rien quand le registre ne donne aucun rang", () => {
    expect(render(<Executif titre="t" rangs={[]} />).container.innerHTML).toBe("");
  });
});
