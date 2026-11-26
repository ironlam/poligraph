import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ProfilePublicationCard } from "@/components/admin/ProfilePublicationCard";

const fetchMock = vi.fn();
const confirmMock = vi.fn();
const respond = (status: number, json: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
});

const DRAFT = {
  politicianId: "pol_1",
  publicationStatus: "DRAFT" as const,
  mandateCount: 2,
  sourcedMandateCount: 1,
  externalIdCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
  fetchMock.mockResolvedValue(respond(200, { publicationStatus: "PUBLISHED", changed: true }));
  confirmMock.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProfilePublicationCard", () => {
  it("dit ce qui est sourcé et propose les gestes vers les autres statuts", () => {
    render(<ProfilePublicationCard {...DRAFT} />);

    expect(
      screen.getByText(/2 mandats, dont 1 avec une\s+source\. 0 identifiant externe\./)
    ).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Publier la fiche",
      "Archiver",
      "Exclure",
    ]);
  });

  it("n'active pas « Publier » sans mandat sourcé ni identifiant, et dit pourquoi", () => {
    render(<ProfilePublicationCard {...DRAFT} sourcedMandateCount={0} />);

    expect(
      (screen.getByRole("button", { name: "Publier la fiche" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/au moins un mandat sourcé ou un identifiant externe/)).toBeTruthy();
  });

  it("envoie un geste, jamais un statut, puis recharge la fiche", async () => {
    render(<ProfilePublicationCard {...DRAFT} />);
    fireEvent.click(screen.getByRole("button", { name: "Publier la fiche" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/politiques/pol_1/publication");
    expect(JSON.parse(init.body)).toEqual({ action: "publish" });
    // Publishing a draft is not a withdrawal: no confirmation asked.
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("demande confirmation avant de retirer une fiche publique, et n'envoie rien sur un refus", () => {
    confirmMock.mockReturnValue(false);
    render(<ProfilePublicationCard {...DRAFT} publicationStatus="PUBLISHED" />);
    fireEvent.click(screen.getByRole("button", { name: "Remettre en brouillon" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("affiche le refus du serveur sans recharger", async () => {
    fetchMock.mockResolvedValue(respond(409, { error: "Cette fiche a 1 affaire publiée." }));
    render(<ProfilePublicationCard {...DRAFT} publicationStatus="PUBLISHED" />);
    fireEvent.click(screen.getByRole("button", { name: "Archiver" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Cette fiche a 1 affaire publiée.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
