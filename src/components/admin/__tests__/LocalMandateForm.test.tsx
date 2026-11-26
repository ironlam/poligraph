import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { LocalMandateForm } from "@/components/admin/LocalMandateForm";

const fetchMock = vi.fn();
const respond = (status: number, json: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
});

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillCommon() {
  fill("Intitulé *", "Adjoint au maire de Saint-Exemple");
  fill("Institution *", "Mairie de Saint-Exemple");
  fill("Début *", "2008");
  fill("Adresse de la source *", "https://example.org/arrete");
}

async function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Ajouter le mandat" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return JSON.parse(fetchMock.mock.calls[0]![1].body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(respond(201, { id: "man_1" }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LocalMandateForm", () => {
  it("envoie la date telle qu'elle est écrite et une fin vide comme inconnue", async () => {
    render(<LocalMandateForm politicianId="pol_1" />);
    fill("Type *", "ADJOINT_MAIRE");
    fill("Code INSEE de la commune *", "13099");
    fillCommon();

    expect(await submit()).toEqual({
      type: "ADJOINT_MAIRE",
      title: "Adjoint au maire de Saint-Exemple",
      institution: "Mairie de Saint-Exemple",
      communeId: "13099",
      startDate: "2008",
      endDate: null,
      isCurrent: false,
      sourceUrl: "https://example.org/arrete",
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/politiques/pol_1/mandats");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toBe("Mandat ajouté.");
  });

  it("ne montre que le territoire du type choisi, et n'envoie que lui", async () => {
    render(<LocalMandateForm politicianId="pol_1" />);
    fill("Code INSEE de la commune *", "13099");
    fill("Type *", "PRESIDENT_DEPARTEMENT");

    expect(screen.queryByLabelText("Code INSEE de la commune *")).toBeNull();
    fill("Code du département *", "83");
    fillCommon();

    const body = await submit();
    expect(body.departmentCode).toBe("83");
    expect(body).not.toHaveProperty("communeId");
  });

  it("propose un SIREN facultatif pour une présidence d'intercommunalité", async () => {
    render(<LocalMandateForm politicianId="pol_1" />);
    fill("Type *", "PRESIDENT_INTERCOMMUNALITE");
    fillCommon();

    expect((screen.getByLabelText(/SIREN/) as HTMLInputElement).required).toBe(false);
    const body = await submit();
    expect(body).not.toHaveProperty("epciSiren");
    expect(body).not.toHaveProperty("communeId");
  });

  it("ne laisse pas cocher « en cours » pour un maire, et le décoche en revenant sur ce type", () => {
    render(<LocalMandateForm politicianId="pol_1" />);
    const box = () => screen.getByLabelText("Mandat en cours") as HTMLInputElement;
    expect(box().disabled).toBe(true);

    fill("Type *", "ADJOINT_MAIRE");
    fireEvent.click(box());
    expect(box().checked).toBe(true);
    expect((screen.getByLabelText("Fin") as HTMLInputElement).disabled).toBe(true);

    fill("Type *", "MAIRE");
    expect(box().checked).toBe(false);
  });

  it("affiche les refus du serveur avec le nom du champ, sans vider la saisie", async () => {
    fetchMock.mockResolvedValue(
      respond(400, {
        error: "Validation error",
        issues: [{ path: ["sourceUrl"], message: "Adresse https attendue" }],
      })
    );
    render(<LocalMandateForm politicianId="pol_1" />);
    fill("Code INSEE de la commune *", "13099");
    fillCommon();
    await submit();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Adresse de la source : Adresse https attendue"
    );
    expect((screen.getByLabelText("Intitulé *") as HTMLInputElement).value).toBe(
      "Adjoint au maire de Saint-Exemple"
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
