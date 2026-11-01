import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  MeasureParliamentFinalVote,
  MeasureParliamentLink,
} from "@/lib/data/measure-parliament-links";
import { MeasureParliamentLinks } from "./MeasureParliamentLinks";

function link(over: Partial<MeasureParliamentLink> = {}): MeasureParliamentLink {
  return {
    dossierSlug: "frais-bancaires",
    title: "Plafonner les frais bancaires",
    status: "EN_COURS",
    linkKind: "SAME_OBJECT",
    finalVotes: [],
    ...over,
  };
}

function finalVote(over: Partial<MeasureParliamentFinalVote> = {}): MeasureParliamentFinalVote {
  return {
    slug: "scrutin-1",
    title: "Texte",
    votingDate: new Date("2025-03-03T12:00:00Z"),
    chamber: "AN",
    result: "ADOPTED",
    counts: { for: 0, against: 0, abstain: 0 },
    groups: [],
    candidateVote: null,
    candidateGroup: null,
    ...over,
  };
}

describe("MeasureParliamentLinks", () => {
  it("n'affiche rien sans rapprochement relu", () => {
    const { container } = render(<MeasureParliamentLinks links={[]} candidateName="A B" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("n'emploie aucun terme interne et dit en une phrase le type de lien", () => {
    render(
      <MeasureParliamentLinks
        links={[link(), link({ dossierSlug: "autre", linkKind: "BROADER_TEXT", title: "Autre" })]}
        candidateName="A B"
      />
    );
    expect(screen.getByText("Un texte porte précisément sur cette mesure.")).toBeInTheDocument();
    expect(screen.getByText("Un texte plus large traite de ce sujet.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/même objet/i);
    expect(screen.getAllByRole("link", { name: "Lire le texte" })[0]).toHaveAttribute(
      "href",
      "/parlement/dossiers/frais-bancaires"
    );
  });

  it("ouvre sur l'issue du texte : le dernier vote final, ou à défaut le statut du dossier", () => {
    render(
      <MeasureParliamentLinks
        candidateName="A B"
        links={[
          link({
            finalVotes: [
              finalVote({
                slug: "s1",
                result: "REJECTED",
                votingDate: new Date("2025-01-10T12:00:00Z"),
              }),
              finalVote({ slug: "s2", result: "ADOPTED", chamber: "SENAT" }),
            ],
          }),
          link({ dossierSlug: "sans-vote", title: "Sans vote" }),
        ]}
      />
    );
    expect(screen.getByText(/Adopté par le Sénat le 3 mars 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Auparavant : rejeté par l'Assemblée nationale/)).toBeInTheDocument();
    expect(screen.getByText("En discussion")).toBeInTheDocument();
  });

  it("n'écrit une ligne de vote que si elle existe, sur le texte et sans participe genré", () => {
    render(
      <MeasureParliamentLinks
        candidateName="Marine Le Pen"
        links={[
          link({
            finalVotes: [
              finalVote({
                candidateVote: "ABSTENTION",
                candidateGroup: { code: "RN", name: "Rassemblement National", position: "POUR" },
              }),
            ],
          }),
          link({ dossierSlug: "x", title: "X", finalVotes: [finalVote({ slug: "s9" })] }),
        ]}
      />
    );
    expect(screen.getAllByText(/Marine Le Pen a choisi l'abstention/)).toHaveLength(1);
    expect(
      screen.getByText(/Son groupe, Rassemblement National : majorité pour/)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ces positions portent sur le texte, pas sur la mesure.")
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/soutient|défend|sa propre mesure|abstenu/i);
  });

  it("ne répète pas la note quand aucune position n'est affichée", () => {
    render(
      <MeasureParliamentLinks candidateName="A B" links={[link({ finalVotes: [finalVote()] })]} />
    );
    expect(screen.queryByText(/portent sur le texte/)).not.toBeInTheDocument();
  });
});
