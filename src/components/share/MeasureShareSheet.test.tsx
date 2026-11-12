import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MeasureShareSheet } from "./MeasureShareSheet";

const data = {
  title: "Camille Exemple : créer un service public d'exemple",
  text: "Camille Exemple, présidentielle 2027",
  url: "https://poligraph.fr/elections/presidentielle-2027/mesures/service-public-exemple",
};

const card = {
  candidateName: "Camille Exemple",
  partyLabel: "Parti d'exemple",
  themeLabel: "Santé",
  text: "Créer un service public d'exemple",
  sourceLine: "Source primaire : Programme de candidature, 3 mars 2026",
  sourceCount: 3,
  attributionLabel: "Formulée personnellement",
};

function open(withCard: boolean) {
  render(
    <MeasureShareSheet slug="service-public-exemple" data={data} card={withCard ? card : null} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Partager cette mesure" }));
}

describe("MeasureShareSheet", () => {
  it("describes the card: who, theme, published text, source and attribution", () => {
    open(true);
    const name =
      screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
    expect(name).toContain("Ce que propose Camille Exemple sur le thème Santé");
    expect(name).toContain("Créer un service public d'exemple");
    expect(name).toContain("Source primaire : Programme de candidature, 3 mars 2026");
    expect(name).toContain("3 sources au total");
    expect(name).toContain("Formulée personnellement");
  });

  it("does not wrap the measure in quotation marks: it is not always a quote", () => {
    open(true);
    const name =
      screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
    expect(name).not.toMatch(/[«»"]/);
  });

  it("offers the link alone when the measure has no source to print", () => {
    open(false);
    expect(screen.queryByRole("img", { name: /Image à partager/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
  });
});
