import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireDocument } from "../acquisition";
import { parseDocument, parseHtml, parsePdfText } from "../parser";

describe("parsing documentaire", () => {
  it("segmente un document HTML", () => {
    const parsed = parseHtml(
      "<html><main><h2>Énergie</h2><p>Réduire la TVA sur l'électricité à 5,5 %.</p></main></html>"
    );
    expect(parsed.mediaType).toBe("html");
    expect(parsed.segments[0]).toMatchObject({ heading: "Énergie", page: null });
  });

  it("rejette un contenu HTML vide", () =>
    expect(() => parseHtml("<html><script>vide</script></html>")).toThrow("vide"));

  it("rejette un PDF invalide", async () => {
    await expect(parseDocument(Buffer.from("%PDF invalide"), "application/pdf")).rejects.toThrow(
      "PDF invalide"
    );
  });

  it("segmente le texte natif extrait d'un PDF en conservant les pages", () => {
    const parsed = parsePdfText(
      [
        "Réduire la TVA sur l'électricité à cinq virgule cinq pour cent.",
        "Construire de nouveaux logements dans les zones tendues.",
      ].join("\f")
    );
    expect(parsed.mediaType).toBe("pdf");
    expect(parsed.scannedPdf).toBe(false);
    expect(parsed.segments.map((segment) => segment.page)).toEqual([1, 2]);
  });

  it("signale un timeout réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    await expect(
      acquireDocument({
        id: "timeout-test",
        url: "https://example.test",
        cacheDir: "/tmp/poligraph-timeout-test",
        timeoutMs: 1,
        forceRefetch: true,
      })
    ).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it("rejette un téléchargement vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(), { status: 200 }))
    );
    await expect(
      acquireDocument({
        id: "empty-test",
        url: "https://example.test",
        cacheDir: "/tmp/poligraph-empty-test",
        forceRefetch: true,
      })
    ).rejects.toThrow("vide");
    vi.unstubAllGlobals();
  });

  it("invalide le cache lorsque l'URL de l'édition change", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "program-cache-url-"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("ancien", { status: 200 }))
      .mockResolvedValueOnce(new Response("nouveau", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await acquireDocument({ id: "edition", url: "https://example.test/v1", cacheDir });
    const acquired = await acquireDocument({
      id: "edition",
      url: "https://example.test/v2",
      cacheDir,
    });
    expect(acquired.bytes.toString()).toBe("nouveau");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("revalide un cache périmé avec son ETag", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "program-cache-etag-"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("stable", { status: 200, headers: { ETag: '"version-1"' } })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    await acquireDocument({ id: "edition", url: "https://example.test/programme", cacheDir });
    const acquired = await acquireDocument({
      id: "edition",
      url: "https://example.test/programme",
      cacheDir,
      cacheMaxAgeMs: -1,
    });
    expect(acquired.fromCache).toBe(true);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "If-None-Match": '"version-1"' }),
    });
    vi.unstubAllGlobals();
  });
});
