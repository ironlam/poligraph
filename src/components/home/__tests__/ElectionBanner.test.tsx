import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ElectionBanner } from "@/components/home/ElectionBanner";
import type { FeaturedElection } from "@/lib/data/elections";

const presidentielle: FeaturedElection = {
  slug: "presidentielle-2027",
  title: "Élection présidentielle de 2027",
  shortTitle: "Présidentielle 2027",
  type: "PRESIDENTIELLE",
  round1Date: new Date("2027-04-11T00:00:00.000Z"),
  round2Date: new Date("2027-04-25T00:00:00.000Z"),
  dateConfirmed: false,
  round1Scores: [],
  winner: null,
  sourcedCandidacyCount: 25,
  hasResults: false,
  communesDepouillees: 0,
};

describe("ElectionBanner", () => {
  it("annonce l'élection et sa promesse loin du scrutin", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2026-08-07T10:00:00.000Z")} />);

    expect(screen.getByText(/Présidentielle 2027/)).toBeInTheDocument();
    expect(screen.getByText(/ce qu'elle a voté/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir le dossier/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );
  });

  it("affiche « Dates provisoires » tant que le décret n'est pas paru", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2026-08-07T10:00:00.000Z")} />);

    expect(screen.getByText("Dates provisoires")).toBeInTheDocument();
  });

  it("retire « Dates provisoires » quand dateConfirmed passe à vrai", () => {
    render(
      <ElectionBanner
        election={{ ...presidentielle, dateConfirmed: true }}
        now={new Date("2026-08-07T10:00:00.000Z")}
      />
    );

    expect(screen.queryByText("Dates provisoires")).not.toBeInTheDocument();
  });

  it("compte les candidatures recensées et jamais « documentées »", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2026-08-07T10:00:00.000Z")} />);

    expect(screen.getByRole("link", { name: /25 candidatures recensées/ })).toBeInTheDocument();
    expect(screen.queryByText(/candidatures documentées/)).not.toBeInTheDocument();
  });

  it("ne rend pas de secondes hors du jour du vote", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2026-08-07T10:00:00.000Z")} />);

    expect(screen.queryByText("secondes")).not.toBeInTheDocument();
  });

  it("rend les secondes et le bureau de vote le jour du scrutin", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2027-04-11T10:00:00.000Z")} />);

    expect(screen.getByText("secondes")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /bureau de vote/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("ne rend aucun compte à rebours après le second tour", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2027-05-10T10:00:00.000Z")} />);

    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText("jours")).not.toBeInTheDocument();
  });

  it("omet le bloc de résultats entre les tours quand les scores manquent", () => {
    render(<ElectionBanner election={presidentielle} now={new Date("2027-04-13T10:00:00.000Z")} />);

    expect(screen.queryByText(/Résultats du 1/)).not.toBeInTheDocument();
  });

  it("rend le bloc de résultats entre les tours quand les scores existent", () => {
    render(
      <ElectionBanner
        election={{
          ...presidentielle,
          round1Scores: [
            {
              candidateName: "Camille Rivière",
              politicianSlug: "camille-riviere",
              partyLabel: "UD",
              pct: 27.4,
            },
          ],
        }}
        now={new Date("2027-04-13T10:00:00.000Z")}
      />
    );

    expect(screen.getByText("Camille Rivière")).toBeInTheDocument();
    expect(screen.getByText("27,4 %")).toBeInTheDocument();
  });

  it("n'accorde aucun bouton présidentiel à une municipale à la une", () => {
    render(
      <ElectionBanner
        election={{
          ...presidentielle,
          slug: "municipales-2032",
          shortTitle: "Municipales 2032",
          type: "MUNICIPALES",
        }}
        now={new Date("2032-04-01T10:00:00.000Z")}
      />
    );

    expect(screen.queryByText(/ce qu'elle a voté/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ouvrir le dossier/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir l'élection/ })).toBeInTheDocument();
  });

  it("ne rend rien du tout quand l'élection n'a pas de date de premier tour", () => {
    const { container } = render(
      <ElectionBanner
        election={{ ...presidentielle, round1Date: null, round2Date: null }}
        now={new Date("2026-08-07T10:00:00.000Z")}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
