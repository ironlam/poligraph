import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresidentialCorpusSearch } from "../PresidentialCorpusSearch";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function response() {
  return {
    state: "results",
    query: "logement",
    total: 2,
    groups: {
      subjects: [] as Array<{
        type: "subject";
        theme: "LOGEMENT_URBANISME";
        label: string;
        url: string;
      }>,
      candidacies: [
        {
          type: "candidacy",
          id: "c1",
          name: "Camille Rivière",
          slug: "camille-riviere",
          url: "/elections/presidentielle-2027/candidats/camille-riviere",
          photoUrl: null,
          blobPhotoUrl: null,
          status: "DECLARE",
          party: null,
        },
      ],
      measures: [
        {
          type: "measure",
          id: "m1",
          text: "Construire davantage de logements accessibles",
          url: "/elections/presidentielle-2027/mesures/m1",
          candidateName: "Camille Rivière",
          candidateSlug: "camille-riviere",
          theme: "LOGEMENT_URBANISME",
          precision: null,
          sourceLabel: "PROGRAMME_CANDIDAT",
          sourceUrl: "https://example.org/programme",
        },
      ],
    },
  };
}

describe("PresidentialCorpusSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function runDebounce() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("ne lance pas de requête sous deux caractères", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PresidentialCorpusSearch />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "l" } });
    await runDebounce();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("n'envoie qu'une suggestion pendant la saisie continue d'une phrase naturelle", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response() });
    vi.stubGlobal("fetch", fetchMock);
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");
    const sentence = "Je veux des informations sur les mesures de retraite";

    for (let index = 1; index <= sentence.length; index += 1) {
      fireEvent.change(input, { target: { value: sentence.slice(0, index) } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("affiche les thématiques avant les personnalités et les mesures", async () => {
    const result = response();
    result.total = 3;
    result.groups.subjects = [
      {
        type: "subject",
        theme: "LOGEMENT_URBANISME",
        label: "Logement & Urbanisme",
        url: "/elections/presidentielle-2027/themes/logement-urbanisme",
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
    render(<PresidentialCorpusSearch />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "logement" } });
    await runDebounce();

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
    const headings = within(listbox).getAllByRole("heading");
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Thématiques",
      "Personnalités suivies",
      "Mesures",
    ]);
    expect(within(listbox).getByText("Logement & Urbanisme")).toBeInTheDocument();
  });

  it("distingue le chargement, l'état vide et l'erreur technique", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          state: "empty",
          query: "introuvable",
          total: 0,
          groups: { subjects: [], candidacies: [], measures: [] },
        }),
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "introuvable" } });
    expect(screen.getByText("Recherche en cours…")).toBeInTheDocument();
    await runDebounce();
    expect(screen.getByText(/Aucune suggestion pour/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "erreur" } });
    await runDebounce();
    expect(screen.getAllByText(/momentanément indisponible/)).toHaveLength(2);
  });

  it("ignore une réponse obsolète arrivée après la requête courante", async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second));
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "première" } });
    await runDebounce();
    fireEvent.change(input, { target: { value: "seconde" } });
    await runDebounce();

    const current = response();
    current.groups.candidacies[0]!.name = "Réponse actuelle";
    await act(async () => {
      resolveSecond({ ok: true, json: async () => current });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Réponse actuelle")).toBeInTheDocument();

    const stale = response();
    stale.groups.candidacies[0]!.name = "Réponse obsolète";
    await act(async () => {
      resolveFirst({ ok: true, json: async () => stale });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText("Réponse obsolète")).not.toBeInTheDocument();
    expect(screen.getByText("Réponse actuelle")).toBeInTheDocument();
  });

  it("permet de naviguer au clavier, d'ouvrir avec Entrée et de fermer avec Échap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response() }));
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "logement" } });
    await runDebounce();
    const firstOption = screen.getAllByRole("option")[0]!;

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(firstOption).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/elections/presidentielle-2027/candidats/camille-riviere");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("efface la requête et restitue le focus", () => {
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "santé" } });
    fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("n'affiche qu'un seul bouton d'effacement", () => {
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "logement" } });
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getAllByRole("button", { name: "Effacer la recherche" })).toHaveLength(1);
  });

  it("envoie la page complète avec une requête partageable", () => {
    render(<PresidentialCorpusSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "santé publique" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith(
      "/elections/presidentielle-2027/recherche?q=sant%C3%A9%20publique"
    );
  });
});
