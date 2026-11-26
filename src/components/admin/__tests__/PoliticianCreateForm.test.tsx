import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The form's job is to make the namesakes unavoidable: no creation before the list for the name
// currently typed has been displayed, and the ids displayed are the ones sent.

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PoliticianCreateForm } from "@/components/admin/PoliticianCreateForm";

const HOMONYM = {
  id: "pol_other",
  publicId: "PG-000042",
  fullName: "Camille Rivière",
  birthDate: null,
  birthPlace: null,
  deathDate: null,
  publicationStatus: "PUBLISHED",
  party: null,
  externalSources: ["RNE"],
  mandates: [
    {
      type: "MAIRE",
      title: "Maire de Saint-Exemple",
      institution: "Mairie",
      departmentCode: "13",
      isCurrent: true,
      commune: { name: "Saint-Exemple", departmentCode: "13" },
    },
  ],
};

const fetchMock = vi.fn();

function respond(status: number, json: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

function typeName() {
  fireEvent.change(screen.getByLabelText("Prénom *"), { target: { value: "Camille" } });
  fireEvent.change(screen.getByLabelText("Nom *"), { target: { value: "Rivière" } });
}

async function search() {
  fireEvent.click(screen.getByRole("button", { name: "Rechercher les fiches du même nom" }));
  await screen.findByRole("button", { name: /créer/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PoliticianCreateForm", () => {
  it("ne propose pas de créer avant la recherche des homonymes", () => {
    render(<PoliticianCreateForm />);
    typeName();
    expect(screen.queryByRole("button", { name: /créer/i })).toBeNull();
  });

  it("affiche ce qui distingue un homonyme, avec un lien vers sa fiche", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { homonyms: [HOMONYM] }));
    render(<PoliticianCreateForm />);
    typeName();
    await search();

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "/api/admin/politiques/homonymes?firstName=Camille&lastName=Rivi%C3%A8re"
    );
    expect(screen.getByText("1 fiche porte déjà ce nom")).toBeTruthy();
    expect(screen.getByText(/Date de naissance inconnue/)).toBeTruthy();
    expect(screen.getByText("Maire de Saint-Exemple · Saint-Exemple (13) · en cours")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Camille Rivière/ }).getAttribute("href")).toBe(
      "/admin/politiques/pol_other"
    );
  });

  it("envoie les homonymes affichés et ouvre la fiche créée", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(200, { homonyms: [HOMONYM] }))
      .mockResolvedValueOnce(respond(201, { id: "pol_new" }));
    render(<PoliticianCreateForm />);
    typeName();
    await search();
    fireEvent.click(screen.getByRole("button", { name: /Aucune de ces personnes/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/politiques/pol_new"));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/admin/politiques");
    expect(JSON.parse(init.body)).toEqual({
      firstName: "Camille",
      lastName: "Rivière",
      civility: null,
      birthDate: null,
      birthPlace: null,
      acknowledgedHomonymIds: ["pol_other"],
    });
  });

  it("retire le bouton de création quand le nom change après la recherche", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { homonyms: [] }));
    render(<PoliticianCreateForm />);
    typeName();
    await search();
    fireEvent.change(screen.getByLabelText("Nom *"), { target: { value: "Rivières" } });

    expect(screen.queryByRole("button", { name: /créer/i })).toBeNull();
  });

  it("sur un refus 409, montre la nouvelle liste et le message, sans naviguer", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(200, { homonyms: [] }))
      .mockResolvedValueOnce(
        respond(409, { error: "Une fiche du même nom existe.", homonyms: [HOMONYM] })
      );
    render(<PoliticianCreateForm />);
    typeName();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "Créer la fiche en brouillon" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Une fiche du même nom existe.");
    expect(screen.getByText("1 fiche porte déjà ce nom")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
