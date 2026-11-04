// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadDebateArchive } from "../debate-transcript-download";

const dir = mkdtempSync(join(tmpdir(), "debate-download-test-"));
const url = "https://data.assemblee-nationale.fr/archive.zip";
afterEach(() => vi.unstubAllGlobals());
// Files only, no real network.
describe("debate archive HTTP", () => {
  it("streams bytes and supplies the conditional ETag", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("zip", { headers: { etag: "next", "content-length": "3" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await downloadDebateArchive(url, join(dir, "ok.zip"), "old")).toEqual({
      notModified: false,
      etag: "next",
    });
    expect(readFileSync(join(dir, "ok.zip"), "utf8")).toBe("zip");
    expect(fetch.mock.calls[0]![1].headers).toEqual({ "If-None-Match": "old" });
    expect(fetch.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
  it("honours 304 without creating a file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
    expect((await downloadDebateArchive(url, join(dir, "304.zip"), "old")).notModified).toBe(true);
  });
  it.each([404, 503])("rejects HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status })));
    await expect(downloadDebateArchive(url, join(dir, "error.zip"))).rejects.toThrow(
      `HTTP ${status}`
    );
  });
  it("rejects HTML, oversized and truncated bodies", async () => {
    const cases: Record<string, string>[] = [
      { "content-type": "text/html" },
      { "content-length": "999999999" },
      { "content-length": "10" },
    ];
    for (const headers of cases) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("zip", { headers })));
      await expect(downloadDebateArchive(url, join(dir, "bad.zip"))).rejects.toThrow();
    }
  });
  it("bounds redirect loops and refuses another host", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(null, { status: 302, headers: { location: url } }))
        )
    );
    await expect(downloadDebateArchive(url, join(dir, "loop.zip"))).rejects.toThrow("redirect");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 302, headers: { location: "https://example.com/zip" } })
        )
    );
    await expect(downloadDebateArchive(url, join(dir, "foreign.zip"))).rejects.toThrow("redirect");
    rmSync(dir, { recursive: true, force: true });
  });
});
