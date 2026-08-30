import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeAndSplit, downloadBuffer, parseIntSafe } from "../csv-download";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeAndSplit", () => {
  it("drops the header line", () => {
    const buffer = Buffer.from("code;nom\n34172;Montpellier\n", "latin1");
    expect(decodeAndSplit(buffer, ";")).toEqual([["34172", "Montpellier"]]);
  });

  it("reads Latin-1, not UTF-8", () => {
    // The ministry publishes Latin-1. Decoding as UTF-8 turns "Béziers" into "B?ziers",
    // and nothing downstream would notice.
    const buffer = Buffer.from("header\n34032;Béziers\n", "latin1");
    expect(decodeAndSplit(buffer, ";")[0]?.[1]).toBe("Béziers");
  });

  it("accepts CRLF line endings", () => {
    const buffer = Buffer.from("header\r\na;b\r\nc;d\r\n", "latin1");
    expect(decodeAndSplit(buffer, ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips blank and whitespace-only lines", () => {
    const buffer = Buffer.from("header\na;b\n\n   \nc;d\n", "latin1");
    expect(decodeAndSplit(buffer, ";")).toHaveLength(2);
  });

  it("returns nothing for a file that holds only a header", () => {
    expect(decodeAndSplit(Buffer.from("header\n", "latin1"), ";")).toEqual([]);
  });
});

describe("parseIntSafe", () => {
  it.each([
    ["", 0],
    ["   ", 0],
    ["42", 42],
    ["1 234", 1234],
    ["1 234", 1234],
    ["abc", 0],
  ])("parses %j as %i", (input, expected) => {
    expect(parseIntSafe(input)).toBe(expected);
  });
});

describe("downloadBuffer", () => {
  it("returns the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("payload").buffer,
      })
    );

    expect((await downloadBuffer("https://example.test/f.csv")).toString()).toBe("payload");
  });

  it("identifies itself", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal("fetch", fetchMock);

    await downloadBuffer("https://example.test/f.csv");

    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toMatch(/^Poligraph\//);
  });

  it("throws rather than parsing an error page", async () => {
    // A 404 body parsed as CSV yields rows that look real. Fail loudly instead.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(downloadBuffer("https://example.test/gone.csv")).rejects.toThrow(
      "HTTP 404 for https://example.test/gone.csv"
    );
  });
});
