import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { BlockedAffairs } from "@/components/admin/BlockedAffairs";

/**
 * This panel is the only part of the matching admin that is a to-do list, and it
 * sits at the top of the review page because that is where a moderator actually
 * lands. It first shipped on the stats dashboard, which nobody opens looking for
 * work; these tests hold the promise it makes wherever it is mounted.
 */

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

function mockFetch(body: unknown = BLOCKED, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BlockedAffairs", () => {
  it("annonce le nombre de rattachements et d'affaires concernées", async () => {
    render(<BlockedAffairs />);
    expect(await screen.findByText(/3 rattachements sur 2 affaires/)).toBeInTheDocument();
  });

  it("sépare les brouillons des fiches déjà en ligne", async () => {
    // Les deux ne disent pas la même chose : un brouillon ne sort pas, une fiche
    // publiée est déjà sortie sur une attribution que personne n'a confirmée.
    render(<BlockedAffairs />);
    expect(
      await screen.findByText(/Brouillons qui ne peuvent pas être publiés/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Fiches en ligne dont l'attribution n'a jamais été validée/)
    ).toBeInTheDocument();
  });

  it("pointe chaque affaire vers sa fiche, où le panneau tranche", async () => {
    render(<BlockedAffairs />);
    const link = await screen.findByRole("link", {
      name: /Attribution controversée d'un gymnase/,
    });
    expect(link).toHaveAttribute("href", "/admin/affaires/aff_draft");
  });

  it("nomme les autres motifs de blocage au lieu de promettre une publication", async () => {
    // Trancher le rattachement ne suffit pas si la note d'implication manque.
    render(<BlockedAffairs />);
    expect(await screen.findByText(/note d'implication manquante/)).toBeInTheDocument();
  });

  it("annonce l'état vide comme un objectif atteint, pas comme une absence de données", async () => {
    vi.stubGlobal("fetch", mockFetch({ decisionCount: 0, affairs: [] }));
    render(<BlockedAffairs />);
    expect(await screen.findByText(/Aucune publication retenue/)).toBeInTheDocument();
  });

  it("signale une panne sans masquer le reste de la page", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false));
    render(<BlockedAffairs />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/indisponible/);
  });
});
