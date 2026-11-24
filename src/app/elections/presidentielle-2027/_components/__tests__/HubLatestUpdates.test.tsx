import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubLatestUpdate, HubStatusChange } from "@/lib/data/hub";
import { HubLatestUpdates } from "../HubLatestUpdates";

type MeasureUpdate = Extract<HubLatestUpdate, { kind: "measure" }>;

function measure(over: Partial<MeasureUpdate> = {}): MeasureUpdate {
  return {
    kind: "measure",
    candidacyId: "cand-alpha",
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

function statusChange(over: Partial<HubStatusChange> = {}): HubLatestUpdate {
  return {
    kind: "status",
    candidacyId: "cand-bravo",
    candidateName: "Bravo Fixture",
    politicianSlug: "bravo-fixture",
    photoUrl: null,
    blobPhotoUrl: null,
    statusLabel: "Candidature annoncée",
    changedAt: new Date("2027-01-07T00:00:00Z"),
    sourceLabel: "Conférence de presse du 7 janvier 2027",
    sourceHost: "example.org",
    ...over,
  };
}

describe("HubLatestUpdates", () => {
  it("ne rend rien tant qu'il n'y a ni mesure publiée ni changement de statut", () => {
    const { container } = render(<HubLatestUpdates updates={[]} lastReviewedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lie chaque mesure à sa page de détail, avec candidat, thème et source", () => {
    render(<HubLatestUpdates updates={[measure()]} lastReviewedAt={null} />);

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
      <HubLatestUpdates
        updates={[measure({ source: { kindLabel: "Programme de candidature", host: null } })]}
        lastReviewedAt={null}
      />
    );
    expect(screen.getByText("Source : Programme de candidature")).toBeInTheDocument();
  });

  it("lie un changement de statut à la fiche de la candidature, avec le libellé du site et la source", () => {
    render(<HubLatestUpdates updates={[statusChange(), measure()]} lastReviewedAt={null} />);

    expect(screen.getByRole("heading", { name: "Dernières mises à jour" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Bravo Fixture/ });
    expect(link).toHaveAttribute("href", "/elections/presidentielle-2027/candidats/bravo-fixture");
    expect(link).toHaveTextContent("Candidature annoncée");
    expect(link).toHaveTextContent("Source : Conférence de presse du 7 janvier 2027 (example.org)");
  });

  it("garde le libellé d'une défaite à la primaire, jamais « retirée »", () => {
    render(
      <HubLatestUpdates
        updates={[statusChange({ statusLabel: "Non retenue à la primaire" })]}
        lastReviewedAt={null}
      />
    );
    const link = screen.getByRole("link", { name: /Bravo Fixture/ });
    expect(link).toHaveTextContent("Non retenue à la primaire");
    expect(link).not.toHaveTextContent(/retirée/i);
  });

  it("affiche la date de dernière revue quand elle est connue", () => {
    render(
      <HubLatestUpdates updates={[measure()]} lastReviewedAt={new Date("2027-01-06T00:00:00Z")} />
    );
    expect(screen.getByText(/Dernière revue éditoriale le/)).toBeInTheDocument();
  });
});
