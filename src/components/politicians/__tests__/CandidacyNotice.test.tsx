import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidacyNotice } from "@/components/politicians/CandidacyNotice";
import type { PoliticianCandidacy } from "@/lib/data/politician-candidacy";

const BEFORE = new Date("2026-08-07T10:00:00.000Z");
const AFTER = new Date("2027-05-10T10:00:00.000Z");

const base: PoliticianCandidacy = {
  electionSlug: "presidentielle-2027",
  electionShortTitle: "Présidentielle 2027",
  round1Date: new Date("2027-04-11T00:00:00.000Z"),
  round2Date: new Date("2027-04-25T00:00:00.000Z"),
  status: "DECLARE",
  sourceUrl: "https://example.org/source",
  sourceLabel: "Le Monde, 14 janvier 2026",
  declaredAt: new Date("2026-01-14T00:00:00.000Z"),
  withdrewAt: null,
  publishedMeasureCount: 0,
  themesCoveredCount: 0,
  primarySourceMeasureCount: 0,
  lastReviewedAt: null,
  round1Pct: null,
  round2Pct: null,
  isElected: false,
};

function renderNotice(
  candidacy: PoliticianCandidacy = base,
  civility: string | null = null,
  now: Date = BEFORE
) {
  return render(<CandidacyNotice candidacy={candidacy} civility={civility} now={now} />);
}

describe("CandidacyNotice", () => {
  it("féminise le titre selon la civilité", () => {
    renderNotice(base, "Mme");
    expect(screen.getByText("Candidate à la présidentielle")).toBeInTheDocument();
  });

  it("garde le masculin par défaut", () => {
    renderNotice(base, "M.");
    expect(screen.getByText("Candidat à la présidentielle")).toBeInTheDocument();
  });

  it("affiche le statut avec le libellé du dépôt", () => {
    renderNotice();
    expect(screen.getByText("Candidature déclarée")).toBeInTheDocument();
  });

  it("ouvre la source dans un nouvel onglet, sans fuite de référent", () => {
    renderNotice();
    const link = screen.getByRole("link", { name: /Le Monde, 14 janvier 2026/ });
    expect(link).toHaveAttribute("href", "https://example.org/source");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("nomme l'absence de mesures au lieu de la masquer", () => {
    renderNotice();
    expect(screen.getByText(/Aucune mesure publiée à ce jour/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Suivre le dossier/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );
  });

  it("annonce le volume avant le clic quand la fiche est publiable", () => {
    renderNotice({
      ...base,
      publishedMeasureCount: 27,
      themesCoveredCount: 9,
      primarySourceMeasureCount: 20,
      lastReviewedAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    expect(screen.getByText(/27 mesures sur 9 sujets/)).toBeInTheDocument();
  });

  it("traite une candidature pressentie plus faiblement, au conditionnel", () => {
    const { container } = renderNotice({ ...base, status: "PRESSENTI" });
    expect(screen.getByText("Cité parmi les candidatures possibles")).toBeInTheDocument();
    expect(screen.getByText(/Rien n'a été déclaré/)).toBeInTheDocument();
    // No accent rule: a press mention must not look like a declaration.
    expect(container.querySelector(".border-l-brand")).toBeNull();
  });

  it("porte le liseré accent sur une candidature déclarée", () => {
    const { container } = renderNotice();
    expect(container.querySelector(".border-l-brand")).not.toBeNull();
  });

  it("dit à quelle date les mesures ont cessé d'être défendues", () => {
    renderNotice({
      ...base,
      status: "RETIRE",
      withdrewAt: new Date("2027-03-03T00:00:00.000Z"),
      publishedMeasureCount: 18,
      primarySourceMeasureCount: 15,
    });
    expect(screen.getByText(/Candidature retirée le/)).toBeInTheDocument();
    expect(screen.getByText(/18 mesures documentées restent consultables/)).toBeInTheDocument();
  });

  it("passe au passé après l'élection, avec les scores", () => {
    renderNotice({ ...base, round1Pct: 27.4, round2Pct: 47.2 }, "Mme", AFTER);
    expect(screen.getByText(/27,4 %/)).toBeInTheDocument();
    expect(screen.getByText(/47,2 %/)).toBeInTheDocument();
  });

  it("n'affiche aucun score après l'élection quand la base n'en a pas", () => {
    renderNotice(base, "Mme", AFTER);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("garde le traitement du retrait après l'élection", () => {
    renderNotice(
      { ...base, status: "RETIRE", withdrewAt: new Date("2027-03-03T00:00:00.000Z") },
      "Mme",
      AFTER
    );
    expect(screen.getByText(/Candidature retirée le/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
