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
