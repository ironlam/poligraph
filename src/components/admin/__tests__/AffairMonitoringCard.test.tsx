import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AffairMonitoringPanel } from "@/lib/affairs/monitoring/queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AffairMonitoringCard } from "@/components/admin/AffairMonitoringCard";

function panel(over: { active: boolean; inScope: boolean }): AffairMonitoringPanel {
  return {
    monitoring: {
      affairId: "aff_test",
      active: over.active,
      nextReviewAt: new Date("2026-11-15T00:00:00Z"),
      dueReason: "AUDIENCE",
      dueNote: "Note de test",
      dateOrigin: "HUMAN",
    },
    checks: [
      {
        id: "chk_1",
        checkedAt: new Date("2026-10-01T09:00:00Z"),
        actor: "HUMAN",
        outcome: "DEFERRED",
        note: null,
        nextReviewAtAfter: new Date("2026-11-15T00:00:00Z"),
      },
    ],
    reason: null,
    inScope: over.inScope,
  };
}

const renderCard = (p: AffairMonitoringPanel | null) =>
  render(<AffairMonitoringCard affairId="aff_test" panel={p} minDate="2026-10-09" />);

describe("AffairMonitoringCard", () => {
  it("montre la date, le motif, la note et l'historique d'un suivi en attente de publication", () => {
    renderCard(panel({ active: false, inScope: false }));
    expect(screen.getByText("Active à la publication")).toBeInTheDocument();
    expect(screen.getByText(/Prochaine vérification le/)).toBeInTheDocument();
    expect(screen.getByText(/Motif : Audience/)).toBeInTheDocument();
    expect(screen.getByText("Note de test")).toBeInTheDocument();
    expect(screen.getByText(/Reportée au/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rien de neuf/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reporter/ })).toBeInTheDocument();
  });

  it("dit « Échéance inactive » pour une affaire publiée dont le suivi est clos", () => {
    renderCard(panel({ active: false, inScope: true }));
    expect(screen.getByText("Échéance inactive")).toBeInTheDocument();
    expect(screen.queryByText("Active à la publication")).not.toBeInTheDocument();
    expect(screen.getByText(/Prochaine vérification le/)).toBeInTheDocument();
  });

  it("propose « Rien de neuf » sur un suivi actif, sans mention d'inactivité", () => {
    renderCard(panel({ active: true, inScope: true }));
    expect(screen.getByRole("button", { name: /Rien de neuf/ })).toBeInTheDocument();
    expect(screen.queryByText("Échéance inactive")).not.toBeInTheDocument();
  });

  it("garde « Aucune échéance » sans suivi", () => {
    renderCard(null);
    expect(screen.getByText("Aucune échéance")).toBeInTheDocument();
    expect(screen.queryByText(/Prochaine vérification le/)).not.toBeInTheDocument();
  });
});
