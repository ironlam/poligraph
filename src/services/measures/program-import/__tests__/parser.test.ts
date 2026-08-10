import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireDocument } from "../acquisition";
import { parseDocument, parseHtml } from "../parser";

function buildTextPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

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
    const bytes = buildTextPdf(
      "Reduire la TVA sur electricite a cinq virgule cinq pour cent. ".repeat(5)
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
