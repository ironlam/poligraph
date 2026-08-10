import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { acquireDocument } from "../acquisition";
import { parseDocument, parseHtml } from "../parser";

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

  it("extrait un PDF texte en conservant les pages", async () => {
    const bytes = await readFile(
      "docs/superpowers/audits/2026-06-07-poligraph-dossier-rgpd-article10.pdf"
    );
    const parsed = await parseDocument(bytes, "application/pdf");
    expect(parsed.mediaType).toBe("pdf");
    expect(parsed.scannedPdf).toBe(false);
    expect(parsed.segments.some((segment) => segment.page === 1 && segment.text.length > 20)).toBe(
      true
    );
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
});
