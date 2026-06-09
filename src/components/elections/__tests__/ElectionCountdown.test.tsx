import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ElectionCountdown } from "@/components/elections/ElectionCountdown";

const baseProps = {
  electionTitle: "Municipales 2026",
  electionIcon: "🗳️",
  dateConfirmed: true,
};

describe("ElectionCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("affiche le nombre de jours restants jusqu'à la cible", () => {
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    render(<ElectionCountdown {...baseProps} targetDate="2026-03-15T00:00:00Z" />);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("jours")).toBeInTheDocument();
  });

  it("expose un rôle timer avec un aria-label nommant l'élection", () => {
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    render(<ElectionCountdown {...baseProps} targetDate="2026-03-15T00:00:00Z" />);
    expect(
      screen.getByRole("timer", { name: "Compte à rebours pour Municipales 2026" })
    ).toBeInTheDocument();
  });

  it("affiche des zéros pour une date passée (pas de valeurs négatives)", () => {
    vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));
    render(<ElectionCountdown {...baseProps} targetDate="2026-03-15T00:00:00Z" />);
    // 4 unités (jours/heures/minutes/secondes) toutes à 0
    expect(screen.getAllByText("0")).toHaveLength(4);
  });

  it("affiche un badge 'Dates provisoires' quand la date n'est pas confirmée", () => {
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    render(
      <ElectionCountdown {...baseProps} dateConfirmed={false} targetDate="2026-03-15T00:00:00Z" />
    );
    expect(screen.getByText("Dates provisoires")).toBeInTheDocument();
  });
});
