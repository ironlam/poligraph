import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubLatestMeasure } from "@/lib/data/hub";
import { HubLatestMeasures } from "../HubLatestMeasures";

function measure(over: Partial<HubLatestMeasure> = {}): HubLatestMeasure {
  return {
    slug: "alpha-encadrer-les-loyers",
    text: "Encadrer les loyers dans les zones tendues.",
    publishedAt: new Date("2027-01-05T00:00:00Z"),
    theme: "LOGEMENT_URBANISME",
    themeLabel: "Logement et urbanisme",
    themeSlug: "logement-urbanisme",
    candidateName: "Alpha Fixture",
    politicianSlug: "alpha-fixture",
    photoUrl: null,
    blobPhotoUrl: null,
    source: { kindLabel: "Discours de campagne", host: "example.org" },
    ...over,
  };
}

describe("HubLatestMeasures", () => {
  it("ne rend rien tant qu'aucune mesure n'est publiée", () => {
    const { container } = render(<HubLatestMeasures measures={[]} lastReviewedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lie chaque mesure à sa page de détail, avec candidat, thème et source", () => {
    render(<HubLatestMeasures measures={[measure()]} lastReviewedAt={null} />);

    const link = screen.getByRole("link", { name: /Encadrer les loyers/ });
    expect(link).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/mesures/alpha-encadrer-les-loyers"
    );
    expect(link).toHaveTextContent("Alpha Fixture");
    expect(link).toHaveTextContent("Logement et urbanisme");
    expect(link).toHaveTextContent("Source : Discours de campagne, example.org");
  });

  it("garde le type de source quand l'hôte est illisible", () => {
    render(
      <HubLatestMeasures
        measures={[measure({ source: { kindLabel: "Programme de candidature", host: null } })]}
        lastReviewedAt={null}
      />
    );
    expect(screen.getByText("Source : Programme de candidature")).toBeInTheDocument();
  });

  it("affiche la date de dernière revue quand elle est connue", () => {
    render(
      <HubLatestMeasures measures={[measure()]} lastReviewedAt={new Date("2027-01-06T00:00:00Z")} />
    );
    expect(screen.getByText(/Dernière revue éditoriale le/)).toBeInTheDocument();
  });
});
