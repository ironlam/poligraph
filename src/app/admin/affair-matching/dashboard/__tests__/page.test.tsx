import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import DashboardPage from "../page";

/**
 * The point of this page is that a moderator can tell, in one glance, what they
 * have to do. These tests hold that promise in place: the actionable list comes
 * first and names the fiche, and the big registry counters stay labelled as
 * context rather than as a backlog.
 */

const STATS = {
  pendingUndecided: 295,
  pendingNoMatch: 1098,
  last7Days: [{ source: "PRESS", judgment: "SAME", count: 4 }],
};

const BLOCKED = {
  decisionCount: 3,
  affairs: [
    {
      id: "aff_draft",
      slug: "gymnase",
      title: "Attribution controversée d'un gymnase",
      publicationStatus: "DRAFT",
      politicianName: "Laurent Wauquiez",
      decisionIds: ["dec_1"],
      messages: ["1 rattachement(s) automatique(s) jamais validé(s)"],
      otherBlockers: [],
    },
    {
      id: "aff_pub",
      slug: "notes-de-frais",
      title: "Notes de frais : saisine du procureur",
      publicationStatus: "PUBLISHED",
      politicianName: "Christian Estrosi",
      decisionIds: ["dec_2", "dec_3"],
      messages: ["2 rattachement(s) confirmé(s) par l'assistance automatique"],
      otherBlockers: ["note d'implication manquante"],
    },
  ],
};

function mockFetch(blocked: unknown = BLOCKED, stats: unknown = STATS) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/blocked") ? blocked : stats;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tableau de bord — ce qu'il y a à trancher", () => {
  it("annonce le nombre de rattachements et d'affaires concernées", async () => {
    render(<DashboardPage />);
    expect(await screen.findByText(/3 rattachements sur 2 affaires/)).toBeInTheDocument();
  });

  it("sépare les brouillons des fiches déjà en ligne", async () => {
    // Les deux ne disent pas la même chose : un brouillon ne sort pas, une fiche
    // publiée est déjà sortie sur une attribution que personne n'a confirmée.
    render(<DashboardPage />);
    expect(
      await screen.findByText(/Brouillons qui ne peuvent pas être publiés/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Fiches en ligne dont l'attribution n'a jamais été validée/)
    ).toBeInTheDocument();
  });

  it("pointe chaque affaire vers sa fiche, où le panneau tranche", async () => {
    render(<DashboardPage />);
    const link = await screen.findByRole("link", {
      name: /Attribution controversée d'un gymnase/,
    });
    expect(link).toHaveAttribute("href", "/admin/affaires/aff_draft");
  });

  it("nomme les autres motifs de blocage au lieu de promettre une publication", async () => {
    // Trancher le rattachement ne suffit pas si la note d'implication manque.
    render(<DashboardPage />);
    expect(await screen.findByText(/note d'implication manquante/)).toBeInTheDocument();
  });

  it("annonce l'état vide comme un objectif atteint, pas comme une absence de données", async () => {
    vi.stubGlobal("fetch", mockFetch({ decisionCount: 0, affairs: [] }));
    render(<DashboardPage />);
    expect(await screen.findByText(/Aucune publication retenue/)).toBeInTheDocument();
  });

  it("survit à une panne de la liste sans emporter le reste de la page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/blocked")) return { ok: false, status: 500 } as Response;
        return { ok: true, status: 200, json: async () => STATS } as Response;
      })
    );
    render(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/indisponible/);
    expect(await screen.findByText("295")).toBeInTheDocument();
  });
});

describe("Tableau de bord — les compteurs restent du contexte", () => {
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
