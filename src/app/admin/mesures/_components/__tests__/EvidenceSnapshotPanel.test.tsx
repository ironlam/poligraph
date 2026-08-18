import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { validEvidenceSnapshot } from "@/lib/measures/__tests__/evidence-snapshot-fixture";
import { EvidenceSnapshotPanel } from "../EvidenceSnapshotPanel";

describe("EvidenceSnapshotPanel", () => {
  it("explique une révision historique sans exiger de snapshot", () => {
    render(
      <EvidenceSnapshotPanel
        formulation="Encadrer les loyers."
        classification="MEASURE"
        snapshotValue={null}
        documentLabel={null}
      />
    );

    expect(screen.getByText("Encadrer les loyers.")).toBeInTheDocument();
    expect(screen.getByText(/historique, manuelle ou issue du pipeline V5/)).toBeInTheDocument();
  });

  it("hiérarchise formulation, raison, source, engagement, contexte et technique", () => {
    const snapshot = validEvidenceSnapshot();
    const [anchor, context] = snapshot.units;
    if (!anchor || !context) throw new Error("Fixture V3 incomplète");
    render(
      <EvidenceSnapshotPanel
        formulation="Créer un droit aux vacances."
        classification="OBJECTIVE"
        snapshotValue={snapshot}
        documentLabel="Cahier pour le temps des loisirs"
      />
    );

    expect(screen.getByText("Ce que PoliGraph propose")).toBeInTheDocument();
    expect(screen.getByText("Pourquoi")).toBeInTheDocument();
    expect(screen.getByText(/CANDIDATE_OBJECTIVE/)).toBeInTheDocument();
    expect(screen.getByText(/pages 12, 13/)).toBeInTheDocument();
    expect(screen.getByText("Engagement")).toBeInTheDocument();
    expect(screen.getByText("Contexte")).toBeInTheDocument();
    expect(screen.getByText(anchor.canonicalText)).toBeInTheDocument();
    expect(screen.getByText(context.rawExactText)).toBeInTheDocument();
    expect(screen.getByText("Provenance technique")).toBeInTheDocument();
    expect(screen.getByText(snapshot.parserVersion)).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Ouvrir le document source officiel dans un nouvel onglet",
      })
    ).toHaveAttribute("href", snapshot.documentUrl);
  });

  it("ne présente pas un snapshot invalide comme preuve", () => {
    const snapshot = validEvidenceSnapshot();
    const [anchor] = snapshot.units;
    if (!anchor) throw new Error("Fixture V3 sans anchor");
    const evidenceText = anchor.rawExactText;
    anchor.rawTextHash = "a".repeat(64);

    render(
      <EvidenceSnapshotPanel
        formulation="Créer un droit aux vacances."
        classification="OBJECTIVE"
        snapshotValue={snapshot}
        documentLabel="Cahier pour le temps des loisirs"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Snapshot présent mais invalide");
    expect(screen.queryByText(evidenceText)).not.toBeInTheDocument();
  });
});
