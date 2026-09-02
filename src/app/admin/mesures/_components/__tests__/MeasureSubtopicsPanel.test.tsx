import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureSubtopicsPanel } from "../MeasureSubtopicsPanel";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  propose: vi.fn(),
  review: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../../actions", () => ({
  proposeSubtopicsAction: mocks.propose,
  reviewSubtopicAction: mocks.review,
}));

describe("MeasureSubtopicsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.propose.mockResolvedValue({ ok: true });
    mocks.review.mockResolvedValue({ ok: true });
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
