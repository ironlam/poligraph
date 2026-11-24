import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ParrainagesFiche } from "../ParrainagesFiche";

const parrainage = {
  electionSlug: "presidentielle-2022",
  candidateName: "HIDALGO Anne",
  mandateLabel: "Maire",
  constituencyLabel: "Quimper",
  publishedOn: "2022-02-15",
};
const text = (container: HTMLElement) => (container.textContent ?? "").replace(/\s+/g, " ");

describe("ParrainagesFiche", () => {
  it("ne rend rien pour une personne sans présentation reliée", () => {
    expect(render(<ParrainagesFiche />).container.innerHTML).toBe("");
    expect(render(<ParrainagesFiche parrainages={[]} />).container.innerHTML).toBe("");
    const horsConfig = [{ ...parrainage, electionSlug: "presidentielle-1965" }];
    expect(render(<ParrainagesFiche parrainages={horsConfig} />).container.innerHTML).toBe("");
  });

  it("écrit « A présenté » avec l'année, le mandat publié et la date de publication", () => {
    const { container } = render(<ParrainagesFiche parrainages={[parrainage]} />);
    expect(text(container)).toContain(
      "A présenté HIDALGO Anne en 2022 (Maire, Quimper, publié le 15 février 2022)."
    );
    expect(
      container.querySelector('a[href="/elections/presidentielle-2022/parrainages/hidalgo-anne"]')
        ?.textContent
    ).toBe("HIDALGO Anne");
  });

  it("porte la phrase fixe une fois et ne parle pas de soutien ailleurs", () => {
    const { container } = render(<ParrainagesFiche parrainages={[parrainage, parrainage]} />);
    const content = text(container);
    expect(content.match(/Une présentation n'est pas un soutien politique\./g)).toHaveLength(1);
    expect(content.replace("Une présentation n'est pas un soutien politique.", "")).not.toMatch(
      /sout|ralli/i
    );
  });

  it("affiche le compte reçu par un candidat, avec un lien vers ses présentations", () => {
    const recus = [
      {
        electionSlug: "presidentielle-2022",
        candidateName: "PÉCRESSE Valérie",
        total: 2636,
        departements: 107,
      },
    ];
    const { container } = render(<ParrainagesFiche recus={recus} />);
    expect(text(container).replace(/\u00a0/g, " ")).toContain(
      "A reçu 2 636 présentations en 2022, venues de 107 départements ou collectivités."
    );
    expect(
      container
        .querySelector('a[href="/elections/presidentielle-2022/parrainages/pecresse-valerie"]')
        ?.textContent?.replace(/\u00a0/g, " ")
    ).toBe("2 636 présentations");
    expect(
      text(container).match(/Une présentation n'est pas un soutien politique\./g)
    ).toHaveLength(1);
  });

  it("montre le compte reçu avant les présentations faites, et une seule phrase fixe", () => {
    const recus = [
      {
        electionSlug: "presidentielle-2022",
        candidateName: "HIDALGO Anne",
        total: 1440,
        departements: 96,
      },
    ];
    const { container } = render(<ParrainagesFiche parrainages={[parrainage]} recus={recus} />);
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
    expect(items[0]).toMatch(/^A reçu/);
    expect(items[1]).toMatch(/^A présenté/);
    expect(
      text(container).match(/Une présentation n'est pas un soutien politique\./g)
    ).toHaveLength(1);
  });

  it("ne rend rien pour un compte d'une élection hors configuration", () => {
    const recus = [
      { electionSlug: "presidentielle-1965", candidateName: "X Y", total: 3, departements: 1 },
    ];
    expect(render(<ParrainagesFiche recus={recus} />).container.innerHTML).toBe("");
  });
});
