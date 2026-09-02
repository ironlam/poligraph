import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidacyNotice } from "@/components/politicians/CandidacyNotice";
import type { PoliticianCandidacy } from "@/lib/data/politician-candidacy";

const BEFORE = new Date("2026-08-07T10:00:00.000Z");
const AFTER = new Date("2027-05-10T10:00:00.000Z");

const base: PoliticianCandidacy = {
  candidacyId: "cand-1",
  electionSlug: "presidentielle-2027",
  electionShortTitle: "Présidentielle 2027",
  round1Date: new Date("2027-04-11T00:00:00.000Z"),
  round2Date: new Date("2027-04-25T00:00:00.000Z"),
  status: "DECLARE",
  sourceUrl: "https://example.org/source",
  sourceLabel: "Le Monde, 14 janvier 2026",
  partyLabel: null,
  partyLogoUrl: null,
  partyColor: null,
  programmeIdentified: false,
  declaredAt: new Date("2026-01-14T00:00:00.000Z"),
  withdrewAt: null,
  synthesis: null,
  synthesisGeneratedAt: null,
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
  now: Date = BEFORE,
  ficheHref: string | null = null
) {
  return render(
    <CandidacyNotice candidacy={candidacy} civility={civility} now={now} ficheHref={ficheHref} />
  );
}

const publishable: PoliticianCandidacy = {
  ...base,
  publishedMeasureCount: 27,
  themesCoveredCount: 9,
  primarySourceMeasureCount: 20,
};

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
    expect(screen.getByText("Candidature annoncée")).toBeInTheDocument();
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
    const { container } = renderNotice({ ...base, status: "PRESSENTI" }, "M.");
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

  it("ne répète pas le statut quand le titre le dit déjà mot pour mot", () => {
    // Observed on the only withdrawn candidacy in production: withdrewAt is null, so the title
    // falls back to "Candidature retirée", which is verbatim CANDIDACY_STATUS_LABELS.RETIRE, and
    // the page printed the same sentence twice in a row.
    renderNotice({ ...base, status: "RETIRE", withdrewAt: null });

    expect(screen.getAllByText("Candidature retirée")).toHaveLength(1);
  });

  it("garde la pastille de statut dès que le titre en diffère", () => {
    renderNotice({
      ...base,
      status: "RETIRE",
      withdrewAt: new Date("2027-03-03T00:00:00.000Z"),
    });

    expect(screen.getByText(/Candidature retirée le/)).toBeInTheDocument();
    expect(screen.getByText("Candidature retirée")).toBeInTheDocument();
  });

  it("nomme la date de retrait manquante au lieu de sous-entendre un datage", () => {
    renderNotice({
      ...base,
      status: "RETIRE",
      withdrewAt: null,
      publishedMeasureCount: 18,
      primarySourceMeasureCount: 15,
    });

    expect(screen.getByText(/Date du retrait non renseignée/)).toBeInTheDocument();
    expect(screen.queryByText(/datées de la période de campagne/)).not.toBeInTheDocument();
  });

  it("accorde les compteurs au singulier : le seuil de publication s'ouvre à une mesure", () => {
    renderNotice({
      ...base,
      publishedMeasureCount: 1,
      themesCoveredCount: 1,
      primarySourceMeasureCount: 1,
    });

    expect(screen.getByText(/1 mesure sur 1 sujet/)).toBeInTheDocument();
    expect(screen.queryByText(/1 mesures/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 sujets/)).not.toBeInTheDocument();
  });

  it("ne genre pas la personne quand la civilité est inconnue", () => {
    // 5 of the 25 sourced presidential candidacies carry a null civility. Defaulting to the
    // masculine would state a gender the database does not hold.
    renderNotice(base, null);

    expect(screen.getByText("Candidature à la présidentielle")).toBeInTheDocument();
    expect(screen.queryByText("Candidat à la présidentielle")).not.toBeInTheDocument();
  });

  it("accorde le participe de l'état pressenti, et le retire quand la civilité manque", () => {
    renderNotice({ ...base, status: "PRESSENTI" }, "Mme");
    expect(screen.getByText("Citée parmi les candidatures possibles")).toBeInTheDocument();

    renderNotice({ ...base, status: "PRESSENTI" }, null);
    expect(screen.getByText("Parmi les candidatures possibles")).toBeInTheDocument();
  });

  it("pointe vers la fiche candidat quand elle est publiable", () => {
    renderNotice(
      publishable,
      "Mme",
      BEFORE,
      "/elections/presidentielle-2027/candidats/camille-riviere"
    );

    expect(screen.getByRole("link", { name: /Son programme, sujet par sujet/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere"
    );
  });

  it("abandonne le possessif quand la destination est le hub et pas sa fiche", () => {
    // The destination lists every candidacy, so promising "son programme" would not be honest.
    renderNotice(publishable, "Mme", BEFORE, null);

    expect(screen.getByRole("link", { name: /Le dossier, sujet par sujet/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );
    expect(screen.queryByText(/Son programme, sujet par sujet/)).not.toBeInTheDocument();
  });

  it("cite sa source même après l'élection : c'est l'état qui affirme le plus", () => {
    renderNotice({ ...base, round1Pct: 27.4, round2Pct: 47.2 }, "Mme", AFTER);

    const link = screen.getByRole("link", { name: /Le Monde, 14 janvier 2026/ });
    expect(link).toHaveAttribute("href", "https://example.org/source");
  });

  it("garde les mesures après l'élection même quand les scores ne sont pas importés", () => {
    // The real state of the site between the close of the second round and the results import.
    renderNotice({ ...base, publishedMeasureCount: 10 }, "Mme", AFTER);

    expect(
      screen.getByText(/10 mesures documentées restent liées à cette campagne/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("dit que la personne a gagné, en accordant sur la civilité", () => {
    const elected = { ...base, round1Pct: 27.4, round2Pct: 52.8, isElected: true };

    renderNotice(elected, "Mme", AFTER);
    expect(screen.getByText(/Élue\./)).toBeInTheDocument();
  });

  it("ne genre personne dans l'annonce de victoire quand la civilité manque", () => {
    renderNotice({ ...base, round2Pct: 52.8, isElected: true }, null, AFTER);

    expect(screen.getByText(/Élection remportée\./)).toBeInTheDocument();
    expect(screen.queryByText(/Élu\./)).not.toBeInTheDocument();
  });

  it("accorde la phrase des mesures au singulier dans l'état retiré", () => {
    renderNotice({
      ...base,
      status: "RETIRE",
      withdrewAt: new Date("2027-03-03T00:00:00.000Z"),
      publishedMeasureCount: 1,
    });

    expect(screen.getByText(/La mesure documentée reste consultable/)).toBeInTheDocument();
    expect(screen.queryByText(/Les 1 mesure/)).not.toBeInTheDocument();
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
