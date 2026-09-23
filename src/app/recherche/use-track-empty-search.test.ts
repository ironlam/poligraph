import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/umami", () => ({ trackUmami: vi.fn() }));
import { trackUmami } from "@/lib/umami";
import { useTrackEmptySearch } from "./use-track-empty-search";

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
});
