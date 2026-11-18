import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { CommuneRecherche, suggestionDetail } from "../CommuneRecherche";

const quimper = {
  code: "29232",
  name: "Quimper",
  postalCodes: ["29000"],
  population: 63000,
  href: "/territoires/communes/quimper-29232",
};
const quimperle = {
  code: "29233",
  name: "Quimperlé",
  postalCodes: ["29300"],
  population: 12000,
  href: "/territoires/communes/quimperle-29233",
};
const fetchMock = vi.fn();

/** Records which suggestion links get clicked, without letting jsdom navigate. */
const clicksOnLinks = () => {
  const hrefs: string[] = [];
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[role="option"] a')) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      hrefs.push(link.getAttribute("href") ?? "");
    });
  }
  return () => hrefs;
};

const type = async (value: string) => {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => [quimper, quimperle] });
  vi.stubGlobal("fetch", fetchMock);
  render(<CommuneRecherche departmentCode="29" departmentName="Finistère" />);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CommuneRecherche", () => {
  it("reste un formulaire GET vers la recherche Territoires, utilisable sans script", () => {
    const form = screen.getByRole("search") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/territoires/recherche");
    expect(form.method).toBe("get");
    expect(screen.getByLabelText("Chercher une commune du département").getAttribute("name")).toBe(
      "q"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("n'interroge pas le serveur sous deux caractères", async () => {
    await type("q");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propose les communes du département, chacune par un vrai lien", async () => {
    await type("quim");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/search/communes?departement=29&q=quim");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.querySelector("a")?.getAttribute("href"))).toEqual([
      "/territoires/communes/quimper-29232",
      "/territoires/communes/quimperle-29233",
    ]);
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2 communes proposées")).toBeTruthy();
  });

  it("n'envoie qu'une requête pour une saisie rapide", async () => {
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "qu" } });
    fireEvent.change(input, { target: { value: "qui" } });
    await type("quim");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ouvre la commune choisie au clavier", async () => {
    await type("quim");
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]!.id);
    const followed = clicksOnLinks();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(followed()).toEqual(["/territoires/communes/quimperle-29233"]);
  });

  it("referme la liste avec Échap et ne navigue pas", async () => {
    await type("quim");
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    const followed = clicksOnLinks();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(followed()).toEqual([]);
  });

  it("dit qu'aucune commune du département ne correspond", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await type("zzz");
    expect(screen.getByText(/Aucune commune de ce département ne correspond/)).toBeTruthy();
    expect(screen.queryAllByRole("option")).toEqual([]);
  });

  it("garde le formulaire utilisable quand le serveur répond en erreur", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await type("quim");
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
  });

  it("décrit une suggestion par son code postal et sa population", () => {
    expect(suggestionDetail(quimper).replace(/\s/g, " ")).toBe("29000 · 63 000 hab.");
    expect(suggestionDetail({ ...quimper, postalCodes: [], population: null })).toBe("");
  });
});
