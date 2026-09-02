import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MeasureQueueRow } from "../../_data/queue-query";
import { QueueTable } from "../QueueTable";

function row(over: Partial<MeasureQueueRow> = {}): MeasureQueueRow {
  return {
    id: "m-1",
    theme: "LOGEMENT_URBANISME",
    politicianName: "Alix Démonstration",
    politicianSlug: "alix-demonstration",
    electionTitle: "Élection de démonstration 2027",
    createdAt: new Date("2027-01-15T00:00:00Z"),
    referenceText: "Encadrer les loyers dans les zones tendues.",
    hasDetails: true,
    suggestedSubtopicCount: 0,
    approvedSubtopicCount: 0,
    state: {
      publication: "PUBLISHED",
      declaredStatus: "PUBLISHED",
      publiclyVisible: true,
      visibilityBlockers: [],
      withdrawal: null,
      depublication: null,
      activeDraft: null,
      draftIsCorrection: false,
      anomalies: [],
    },
    ...over,
  };
}

describe("QueueTable", () => {
  it("garde la sémantique tabulaire et des en-têtes de colonnes", () => {
    // A CSS grid on a <table> destroys what screen readers use to navigate it.
    render(<QueueTable rows={[row()]} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole("columnheader", { name: /Candidature/ })).toBeInTheDocument();
  });

  it("qualifie l'absence de texte au lieu de laisser une cellule vide", () => {
    render(<QueueTable rows={[row({ referenceText: null })]} />);

    expect(screen.getByText("Aucune révision saisie")).toBeInTheDocument();
  });

  it("ne rend jamais une cellule vide ni un tiret seul", () => {
    const { container } = render(
      <QueueTable
        rows={[
          row(),
          row({ id: "m-2", referenceText: null, politicianName: "Camille Exemple" }),
          row({
            id: "m-3",
            state: {
              ...row().state,
              publiclyVisible: false,
              visibilityBlockers: ["revision_without_source"],
              anomalies: [{ code: "published_revision_without_source", detail: "rev-9" }],
            },
          }),
        ]}
      />
    );

    const cells = Array.from(container.querySelectorAll("td"));
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const text = cell.textContent?.trim() ?? "";
      expect(text).not.toBe("");
      expect(text).not.toBe("-");
      expect(text).not.toBe("—");
      expect(text).not.toBe("n/a");
    }
  });

  it("explique un résultat vide au lieu de rendre un tableau nu", () => {
    render(<QueueTable rows={[]} />);

    expect(screen.getByText("Aucune mesure ne correspond à ces filtres.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("propose l’action correspondant au filtre d’enrichissement", () => {
    render(
      <QueueTable
        rows={[row({ suggestedSubtopicCount: 2 })]}
        activeEnrichment="SUBTOPICS_PENDING"
      />
    );

    expect(screen.getByRole("link", { name: "Valider les sous-thèmes" })).toHaveAttribute(
      "href",
      "/admin/mesures/m-1#subtopics-heading"
    );
  });

  it("conduit directement aux actions de révision pour compléter le contexte", () => {
    render(<QueueTable rows={[row({ hasDetails: false })]} activeEnrichment="DETAILS_MISSING" />);

    expect(screen.getByRole("link", { name: "Compléter le contexte" })).toHaveAttribute(
      "href",
      "/admin/mesures/m-1#actions-heading"
    );
  });
});
