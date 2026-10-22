import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureSubtopicsPanel } from "../MeasureSubtopicsPanel";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  propose: vi.fn(),
  review: vi.fn(),
  add: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../../actions", () => ({
  proposeSubtopicsAction: mocks.propose,
  reviewSubtopicAction: mocks.review,
  addSubtopicAction: mocks.add,
}));

describe("MeasureSubtopicsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.propose.mockResolvedValue({ ok: true });
    mocks.review.mockResolvedValue({ ok: true });
    mocks.add.mockResolvedValue({ ok: true });
  });

  const approvedItem = (id: string, label: string) => ({
    subtopicId: id,
    label,
    status: "APPROVED" as const,
    confidence: null,
  });

  it("laisse relancer la proposition quand un sous-thème est déjà validé", () => {
    render(
      <MeasureSubtopicsPanel
        measureId="measure-1"
        revisionId="revision-1"
        assignments={[approvedItem("topic-1", "Loyers")]}
      />
    );

    expect(screen.getByRole("button", { name: "Proposer des sous-thèmes" })).toBeEnabled();
    expect(screen.getByText(/places libres/)).toBeInTheDocument();
  });

  it("bloque la proposition et l'ajout au maximum de trois sous-thèmes", () => {
    render(
      <MeasureSubtopicsPanel
        measureId="measure-1"
        revisionId="revision-1"
        assignments={[
          approvedItem("topic-1", "Loyers"),
          approvedItem("topic-2", "Logement social"),
          approvedItem("topic-3", "Accès au logement"),
        ]}
        addableSubtopics={[{ id: "topic-4", label: "Construction et rénovation" }]}
      />
    );

    expect(screen.getByRole("button", { name: "Proposer des sous-thèmes" })).toBeDisabled();
    expect(screen.getByText(/le maximum est atteint/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ajouter un sous-thème")).not.toBeInTheDocument();
  });

  it("ajoute à la main un sous-thème choisi dans la liste du thème", async () => {
    render(
      <MeasureSubtopicsPanel
        measureId="measure-1"
        revisionId="revision-1"
        assignments={[approvedItem("topic-1", "Loyers")]}
        addableSubtopics={[
          { id: "topic-2", label: "Logement social" },
          { id: "topic-3", label: "Construction et rénovation" },
        ]}
      />
    );

    const add = screen.getByRole("button", { name: "Ajouter" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ajouter un sous-thème"), {
      target: { value: "topic-2" },
    });
    expect(add).toBeEnabled();
    fireEvent.click(add);

    await vi.waitFor(() => {
      expect(mocks.add).toHaveBeenCalledWith({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicId: "topic-2",
      });
    });
  });

  it("n'affiche pas de sélecteur quand il n'y a rien à ajouter", () => {
    render(
      <MeasureSubtopicsPanel measureId="measure-1" revisionId="revision-1" assignments={[]} />
    );

    expect(screen.queryByLabelText("Ajouter un sous-thème")).not.toBeInTheDocument();
  });

  it("rend deux décisions explicites pour chaque proposition", () => {
    render(
      <MeasureSubtopicsPanel
        measureId="measure-1"
        revisionId="revision-1"
        assignments={[
          { subtopicId: "topic-1", label: "Loyers", status: "SUGGESTED", confidence: 0.91 },
        ]}
      />
    );

    expect(screen.getByText("confiance 91 %")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeEnabled();
  });

  it("transmet une validation humaine avec la révision ciblée", async () => {
    render(
      <MeasureSubtopicsPanel
        measureId="measure-1"
        revisionId="revision-1"
        assignments={[
          { subtopicId: "topic-1", label: "Loyers", status: "SUGGESTED", confidence: 0.91 },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await vi.waitFor(() => {
      expect(mocks.review).toHaveBeenCalledWith({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicId: "topic-1",
        status: "APPROVED",
      });
    });
  });
});
