import { render, screen } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ScrutinContext } from "../ScrutinContext";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
afterAll(() => vi.unstubAllGlobals());

const analysis = {
  argumentsFor: "La publication permet un contrôle des revenus.",
  argumentsAgainst: "",
  sourceType: "DEBATE_TRANSCRIPT",
  modelVersion: "mistral-large-latest",
  sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CR1",
  commonDiscussion: true,
};
describe("traceable debate synthesis", () => {
  it("links the official source and distinguishes a common discussion", () => {
    render(<ScrutinContext summary={null} citizenImpact={null} isKeyVote analysis={analysis} />);
    const link = screen.getByRole("link", { name: /Consulter le compte rendu/ });
    expect(link).toHaveAttribute("href", analysis.sourceUrl);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/discuté avec d’autres amendements/)).toBeInTheDocument();
    expect(screen.getAllByText("Aucun argument contre identifié dans ce passage.")).toHaveLength(2);
  });
  it("does not describe a single-amendment discussion as common", () => {
    render(
      <ScrutinContext
        summary={null}
        citizenImpact={null}
        isKeyVote
        analysis={{ ...analysis, commonDiscussion: false }}
      />
    );
    expect(screen.queryByText(/discuté avec d’autres amendements/)).not.toBeInTheDocument();
  });
});

const withReasons = {
  ...analysis,
  commonDiscussion: false,
  reasons: {
    for: [
      {
        text: "Les ETI représentent 30 % des emplois.",
        shared: false,
        speakers: [
          {
            name: "M. Paul Midy",
            slug: "paul-midy",
            groupCode: "EPR",
            groupName: "Ensemble pour la République",
            government: false,
            role: null,
          },
        ],
        quotes: [{ speaker: "M. Paul Midy", text: "Les ETI totalisent 30 % des emplois." }],
      },
    ],
    against: [
      {
        text: "La mesure coûterait très cher.",
        shared: true,
        speakers: [
          {
            name: "M. Roland Lescure",
            slug: null,
            groupCode: null,
            groupName: null,
            government: true,
            role: "ministre",
          },
        ],
        quotes: [{ speaker: "M. Roland Lescure", text: "Cela coûterait très cher." }],
      },
    ],
  },
};

describe("reasons of the debate", () => {
  it("shows one reason per item with its speaker, link, group and quote", () => {
    render(<ScrutinContext summary={null} citizenImpact={null} isKeyVote analysis={withReasons} />);
    expect(screen.getByRole("heading", { name: "Pourquoi pour" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pourquoi contre" })).toBeInTheDocument();
    expect(screen.getByText("Les ETI représentent 30 % des emplois.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Fiche de M. Paul Midy" });
    expect(link).toHaveAttribute("href", "/politiques/paul-midy");
    expect(screen.getByText("EPR")).toBeInTheDocument();
    expect(screen.getByText(/Les ETI totalisent 30 % des emplois\./)).toBeInTheDocument();
  });
  it("says the list of reasons is not exhaustive", () => {
    render(<ScrutinContext summary={null} citizenImpact={null} isKeyVote analysis={withReasons} />);
    expect(screen.getByText(/ce n’est pas une liste complète du\s+débat/)).toBeInTheDocument();
  });
  it("tags a minister as Government and keeps an unlinked speaker as plain text", () => {
    render(<ScrutinContext summary={null} citizenImpact={null} isKeyVote analysis={withReasons} />);
    expect(screen.getByText("Gouvernement")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lescure/ })).not.toBeInTheDocument();
    expect(screen.getByText("M. Roland Lescure", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Discussion commune")).toBeInTheDocument();
  });
  it("says so when a side has no reason, and still links the official source", () => {
    render(
      <ScrutinContext
        summary={null}
        citizenImpact={null}
        isKeyVote
        analysis={{ ...withReasons, reasons: { ...withReasons.reasons, against: [] } }}
      />
    );
    expect(
      screen.getByText(/Aucune raison contre la mesure n’a pu être identifiée/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Consulter le compte rendu/ })).toHaveAttribute(
      "href",
      analysis.sourceUrl
    );
  });
  it("keeps the previous layout for an analysis without structured reasons", () => {
    render(
      <ScrutinContext
        summary={null}
        citizenImpact={null}
        isKeyVote
        analysis={{ ...analysis, reasons: null }}
      />
    );
    expect(screen.getAllByText("La publication permet un contrôle des revenus.")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Pourquoi pour" })).not.toBeInTheDocument();
  });
});

describe("what the vote changes", () => {
  it("leads with the summary then the effect on readers", () => {
    render(
      <ScrutinContext
        summary="Cet amendement ouvre le crédit d'impôt aux ETI."
        citizenImpact="Des entreprises paieraient moins d'impôts."
        isKeyVote={false}
        analysis={null}
      />
    );
    expect(screen.getByRole("heading", { name: "Ce que ça change" })).toBeInTheDocument();
    expect(screen.getByText("Cet amendement ouvre le crédit d'impôt aux ETI.")).toBeInTheDocument();
    expect(screen.getByText("Pour vous et pour la société")).toBeInTheDocument();
    expect(screen.getByText("Des entreprises paieraient moins d'impôts.")).toBeInTheDocument();
  });
  it("shows a lone summary under a plain title", () => {
    render(
      <ScrutinContext
        summary="Un résumé seul."
        citizenImpact={null}
        isKeyVote={false}
        analysis={null}
      />
    );
    expect(screen.getByRole("heading", { name: "Résumé" })).toBeInTheDocument();
    expect(screen.queryByText("Pour vous et pour la société")).not.toBeInTheDocument();
  });
  it("puts the individual votes below, without tabs", () => {
    render(
      <ScrutinContext
        summary={null}
        citizenImpact="Effet."
        isKeyVote={false}
        analysis={null}
        votesDetailSlot={<p>Liste des votes</p>}
      />
    );
    expect(screen.getByRole("heading", { name: "Votes individuels" })).toBeInTheDocument();
    expect(screen.getByText("Liste des votes")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
