import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import DashboardPage from "../page";

/**
 * The to-do list lives on the review page, not here: this one is activity and
 * volume. What these tests hold is that the two large counters keep saying what
 * they are, because presented bare they read as a backlog to clear and sent a
 * moderator looking for 1800 pieces of work that did not exist.
 */

const STATS = {
  pendingUndecided: 295,
  pendingNoMatch: 1098,
  last7Days: [{ source: "PRESS", judgment: "SAME", count: 4 }],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => STATS }) as Response)
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tableau de bord — les compteurs restent du contexte", () => {
  it("affiche les volumes du registre", async () => {
    render(<DashboardPage />);
    expect(await screen.findByText("295")).toBeInTheDocument();
    expect(screen.getByText("1098")).toBeInTheDocument();
  });

  it("dit explicitement que les compteurs ne sont pas la charge de travail", async () => {
    render(<DashboardPage />);
    await waitFor(() =>
      expect(screen.getByText(/seules celles listées plus haut/)).toBeInTheDocument()
    );
  });

  it("dit qu'un NO_MATCH ne bloque jamais une publication", async () => {
    // Vrai par construction : la garde ne requête que SAME et UNDECIDED.
    render(<DashboardPage />);
    await waitFor(() =>
      expect(screen.getByText(/ne bloquent jamais une publication/)).toBeInTheDocument()
    );
  });
});
