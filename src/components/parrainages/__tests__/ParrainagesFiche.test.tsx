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
});
