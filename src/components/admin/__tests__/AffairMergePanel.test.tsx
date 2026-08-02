import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

import { AffairMergePanel, type SiblingAffair } from "@/components/admin/AffairMergePanel";

const DRAFT: SiblingAffair = {
  id: "aff_draft",
  title: "Plainte classée sans suite",
  status: "CLASSEMENT_SANS_SUITE",
  category: "PRISE_ILLEGALE_INTERETS",
  publicationStatus: "DRAFT",
  sourceCount: 1,
};

const PUBLISHED: SiblingAffair = {
  id: "aff_pub",
  title: "Autre affaire déjà en ligne",
  status: "ENQUETE_PRELIMINAIRE",
  category: "TRAFIC_INFLUENCE",
  publicationStatus: "PUBLISHED",
  sourceCount: 3,
};

function setup(siblings: SiblingAffair[], published = true) {
  return render(
    <AffairMergePanel
      affairId="aff_current"
      affairTitle="Plainte pour trafic d'influence"
      affairIsPublished={published}
      siblings={siblings}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ proposalsCreated: 2 }) }))
  );
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true)
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("AffairMergePanel", () => {
  it("ne s'affiche pas quand la personne n'a pas d'autre affaire", () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("liste les autres affaires avec ce qui permet de les reconnaître", () => {
    setup([DRAFT]);
    expect(screen.getByText("Plainte classée sans suite")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText(/1 source/)).toBeInTheDocument();
  });

  it("refuse d'absorber une fiche publiée avant même le clic", async () => {
    // La route refuse de supprimer une page qu'un lecteur peut atteindre. Le dire
    // dans l'interface vaut mieux qu'un 409 après coup.
    setup([PUBLISHED]);
    const button = screen.getByRole("button", { name: /Absorber/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("dépubliez"));
  });

  it("absorbe dans le sens annoncé : la fiche courante survit", async () => {
    setup([DRAFT]);
    await userEvent.click(screen.getByRole("button", { name: /Absorber/ }));

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe("/api/admin/affaires/doublons/fusionner");
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body.keepId).toBe("aff_current");
    expect(body.removeId).toBe("aff_draft");
  });

  it("marque la décision comme humaine, pas comme un score", () => {
    // Le registre des paires distingue ce qu'un seuil a proposé de ce qu'une
    // personne a tranché ; envoyer un score calculé effacerait la différence.
    setup([DRAFT]);
    return userEvent.click(screen.getByRole("button", { name: /Absorber/ })).then(() => {
      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse((call?.[1] as RequestInit).body as string);
      expect(body.signal).toMatchObject({ confidence: "CERTAIN", score: 1 });
    });
  });

  it("annonce les propositions créées quand la survivante est publiée", async () => {
    setup([DRAFT]);
    await userEvent.click(screen.getByRole("button", { name: /Absorber/ }));
    expect(await screen.findByRole("status")).toHaveTextContent(/2 proposition/);
  });

  it("prévient que rien ne sera écrit directement sur une fiche publiée", async () => {
    setup([DRAFT], true);
    await userEvent.click(screen.getByRole("button", { name: /Absorber/ }));
    const message = (globalThis.confirm as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(message).toContain("propositions à valider");
  });

  it("remonte l'erreur de l'API au lieu de laisser croire à un succès", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "Refusé" }) }))
    );
    setup([DRAFT]);
    await userEvent.click(screen.getByRole("button", { name: /Absorber/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refusé");
  });

  it("n'appelle rien si la confirmation est refusée", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false)
    );
    setup([DRAFT]);
    await userEvent.click(screen.getByRole("button", { name: /Absorber/ }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
