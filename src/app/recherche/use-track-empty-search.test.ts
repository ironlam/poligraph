import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/umami", () => ({ trackUmami: vi.fn() }));
import { trackUmami } from "@/lib/umami";
import { normaliseSearchQuery, useTrackEmptySearch } from "./use-track-empty-search";

/**
 * What a citizen searched for and did not find is an editorial backlog: it names the gaps in
 * the database. The value of the signal depends entirely on it being clean, so these tests
 * pin the three ways it would otherwise fill up with noise: prefixes typed on the way to a
 * real query, the same term reported twice, and searches that did find something.
 */
describe("useTrackEmptySearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(trackUmami).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  /** Render the hook, then let its settle delay elapse. */
  function settle(query: string, noResults: boolean) {
    const view = renderHook(({ q, n }) => useTrackEmptySearch(q, n), {
      initialProps: { q: query, n: noResults },
    });
    vi.advanceTimersByTime(2000);
    return view;
  }

  it("reports a search that found nothing, with the term", () => {
    settle("loi hadopi", true);
    expect(trackUmami).toHaveBeenCalledWith("search_no_results", { query: "loi hadopi" });
  });

  it("stays quiet when the search found something", () => {
    settle("emmanuel macron", false);
    expect(trackUmami).not.toHaveBeenCalled();
  });

  it("does not report a prefix typed on the way to a longer query", () => {
    const { rerender } = renderHook(({ q, n }) => useTrackEmptySearch(q, n), {
      initialProps: { q: "hado", n: true },
    });
    vi.advanceTimersByTime(300);
    rerender({ q: "hadopi", n: true });
    vi.advanceTimersByTime(2000);

    expect(trackUmami).toHaveBeenCalledTimes(1);
    expect(trackUmami).toHaveBeenCalledWith("search_no_results", { query: "hadopi" });
  });

  it("reports a given term only once, even if the user comes back to it", () => {
    const { rerender } = renderHook(({ q, n }) => useTrackEmptySearch(q, n), {
      initialProps: { q: "hadopi", n: true },
    });
    vi.advanceTimersByTime(2000);
    rerender({ q: "dadvsi", n: true });
    vi.advanceTimersByTime(2000);
    rerender({ q: "hadopi", n: true });
    vi.advanceTimersByTime(2000);

    expect(trackUmami).toHaveBeenCalledTimes(2);
  });

  it("normalises the term so the same search is one line, not four", () => {
    settle("  LOI   Hadopi  ", true);
    expect(trackUmami).toHaveBeenCalledWith("search_no_results", { query: "loi hadopi" });
  });

  it("caps a pasted paragraph instead of sending it whole", () => {
    settle("x".repeat(300), true);
    const sent = vi.mocked(trackUmami).mock.calls[0]![1] as { query: string };
    expect(sent.query).toHaveLength(60);
  });

  it("sends nothing at all when the term looks like contact details", () => {
    settle("jean.dupont@example.org", true);
    expect(trackUmami).not.toHaveBeenCalled();
  });
});

/**
 * The term leaves the browser for Umami Cloud, a third party. These cases are the ones a rule
 * written around consecutive characters gets wrong: separators are how a human actually writes
 * an address or a number, so each rejection is checked in its spaced form too.
 */
describe("normaliseSearchQuery", () => {
  it.each([
    ["jean.dupont@example.org", "une adresse"],
    ["jean dupont @ example.org", "une adresse espacée autour de l'arobase"],
    ["0612345678", "un numéro collé"],
    ["06 12 34 56 78", "un numéro écrit comme on l'écrit vraiment"],
    ["06.12.34.56.78", "un numéro séparé par des points"],
    ["06-12-34-56-78", "un numéro séparé par des tirets"],
    ["+33 6 12 34 56 78", "un numéro au format international"],
  ])("rejette %j (%s)", (query) => {
    expect(normaliseSearchQuery(query)).toBe("");
  });

  it.each([
    ["@jlmelenchon", "un pseudo, l'arobase n'a rien avant elle"],
    ["loi 2016-1088", "un numéro de loi, huit chiffres"],
    ["75001", "un code postal"],
    ["article 49.3", "un article de la Constitution"],
    ["jean-luc mélenchon", "un nom composé"],
  ])("laisse passer %j (%s)", (query) => {
    expect(normaliseSearchQuery(query)).not.toBe("");
  });

  it("juge la forme sur le terme entier, pas sur ses 60 premiers caractères", () => {
    // Une adresse placée au-delà de la coupe serait sinon simplement tronquée, et les 60
    // premiers caractères partiraient quand même.
    const pasted = `${"a".repeat(80)} jean.dupont@example.org`;
    expect(normaliseSearchQuery(pasted)).toBe("");
  });
});
