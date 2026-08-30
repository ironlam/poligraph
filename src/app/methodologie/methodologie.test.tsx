import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MethodologiePage, { metadata as indexMetadata } from "./page";
import PresidentialMeasuresMethodologyPage, {
  metadata as measuresMetadata,
} from "./mesures-presidentielle-2027/page";

describe("pages de méthodologie", () => {
  it("présente la méthodologie générale comme une entrée par domaine", () => {
    const { container } = render(<MethodologiePage />);

    expect(indexMetadata.title).toBe("Méthodologie de Poligraph");
    expect(screen.getByRole("link", { name: /Mesures de la présidentielle 2027/ })).toHaveAttribute(
      "href",
      "/methodologie/mesures-presidentielle-2027"
    );
    expect(container.querySelector("#comment-nous-comptons")).toBeInTheDocument();
  });

  it("explique la chaîne éditoriale des mesures sur une URL canonique dédiée", () => {
    render(<PresidentialMeasuresMethodologyPage />);

    expect(measuresMetadata.alternates?.canonical).toBe(
      "/methodologie/mesures-presidentielle-2027"
    );
    expect(
      screen.getByRole("heading", { name: "Comment les mesures sont documentées" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Extraction, relecture et publication" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thèmes et sous-thèmes" })).toBeInTheDocument();
    expect(screen.queryByText("Objectif quantifié")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Elle ne prouve pas qu'une proposition n'existe pas/)
    ).toBeInTheDocument();
  });
});
