import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  FactCheckSubjectLinks,
  landingLinkLabel,
  type FactCheckSubject,
} from "@/components/factchecks/FactCheckSubjectLinks";

function subject(overrides: Partial<FactCheckSubject> = {}): FactCheckSubject {
  return {
    slug: "jeanne-dupont",
    fullName: "Jeanne Dupont",
    landingHref: "/factchecks/politique/jeanne-dupont",
    factCheckCount: 12,
    hasPublishedAssetDeclaration: false,
    hasCandidacy: false,
    ...overrides,
  };
}

const linksOf = (section: HTMLElement) =>
  within(section)
    .getAllByRole("link")
    .map((a) => [a.textContent, a.getAttribute("href")]);

describe("FactCheckSubjectLinks", () => {
  it("n'affiche rien sans personne citée", () => {
    const { container } = render(<FactCheckSubjectLinks subjects={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("titre le bloc au nom de la personne et lie sa page de vérifications avec le nombre", () => {
    render(<FactCheckSubjectLinks subjects={[subject()]} />);
    const section = screen.getByRole("region", {
      name: "Tout ce qui a été vérifié sur Jeanne Dupont",
    });
    expect(linksOf(section)).toEqual([
      ["Voir les 12 vérifications", "/factchecks/politique/jeanne-dupont"],
    ]);
  });

  it("ajoute le patrimoine et la fiche candidat quand la base les porte, dans cet ordre", () => {
    render(
      <FactCheckSubjectLinks
        subjects={[subject({ hasPublishedAssetDeclaration: true, hasCandidacy: true })]}
      />
    );
    const section = screen.getByRole("region");
    expect(linksOf(section)).toEqual([
      ["Voir les 12 vérifications", "/factchecks/politique/jeanne-dupont"],
      ["Ses déclarations de patrimoine", "/politiques/jeanne-dupont?tab=patrimoine"],
      ["Sa fiche de candidat 2027", "/elections/presidentielle-2027/candidats/jeanne-dupont"],
    ]);
  });

  it("rend un bloc par personne, au même format", () => {
    render(
      <FactCheckSubjectLinks
        subjects={[
          subject({ hasCandidacy: true }),
          subject({
            slug: "paul-martin",
            fullName: "Paul Martin",
            landingHref: "/factchecks/politique/paul-martin",
            factCheckCount: 3,
            hasPublishedAssetDeclaration: true,
          }),
        ]}
      />
    );
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-labelledby"))).toEqual([
      "verifie-sur-jeanne-dupont",
      "verifie-sur-paul-martin",
    ]);
    expect(linksOf(sections[1]!)).toEqual([
      ["Voir les 3 vérifications", "/factchecks/politique/paul-martin"],
      ["Ses déclarations de patrimoine", "/politiques/paul-martin?tab=patrimoine"],
    ]);
  });
});

describe("landingLinkLabel", () => {
  it("compte au pluriel et formate les milliers à la française", () => {
    expect(landingLinkLabel(2)).toBe("Voir les 2 vérifications");
    expect(landingLinkLabel(1234)).toBe("Voir les 1 234 vérifications");
  });

  it("ne dit pas « 1 vérification » quand la page est la seule", () => {
    expect(landingLinkLabel(1)).toBe("Voir sa page de vérifications");
  });
});
