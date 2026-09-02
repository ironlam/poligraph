import { afterEach, describe, it, expect, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    legislativeDossier: {
      findMany: vi.fn().mockResolvedValue([] as unknown[]),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  buildDocumentUrl,
  downloadDocumentText,
  extractExposeDesMotifs,
  looksLikeParliamentaryDocument,
  syncLegislationContent,
  LegislationContentBatchError,
  DOCUMENT_HOST,
} from "@/services/sync/legislation-content";
import { extractBlockText } from "@/lib/parsing/html-block-text";

describe("buildDocumentUrl", () => {
  it("targets the AN open data endpoint, not the retired docparl host", () => {
    expect(buildDocumentUrl("PIONANR5L17B3110")).toBe(
      "https://www.assemblee-nationale.fr/dyn/opendata/PIONANR5L17B3110.html"
    );
    expect(DOCUMENT_HOST).not.toContain("docparl");
  });

  it("builds the same URL shape for a Senate-originated text", () => {
    expect(buildDocumentUrl("PIONSNR5S479B0937")).toBe(
      "https://www.assemblee-nationale.fr/dyn/opendata/PIONSNR5S479B0937.html"
    );
  });

  it("escapes an unexpected document id instead of forging a path", () => {
    expect(buildDocumentUrl("../../etc/passwd")).toBe(
      "https://www.assemblee-nationale.fr/dyn/opendata/..%2F..%2Fetc%2Fpasswd.html"
    );
  });
});

describe("extractExposeDesMotifs on open data HTML", () => {
  const exposeBody =
    "Mesdames, Messieurs, la présente proposition de loi vise à renforcer " +
    "l'information des citoyens sur le travail parlementaire, dans la continuité " +
    "des engagements pris devant la représentation nationale.";

  function documentHtml(body: string): string {
    return `<html><head><title>Proposition de loi</title><style>p{margin:0}</style></head>
      <body><h1>N° 3110</h1><h2>EXPOSÉ DES MOTIFS</h2><p>${body}</p>
      <h2>Article 1er</h2><p>Le code électoral est ainsi modifié.</p></body></html>`;
  }

  it("extracts the exposé section and stops at the first article", () => {
    const expose = extractExposeDesMotifs(extractBlockText(documentHtml(exposeBody)));

    expect(expose).toContain("Mesdames, Messieurs");
    expect(expose).toContain("information des citoyens");
    expect(expose).not.toContain("code électoral");
  });

  it("decodes entities coming from the HTML source", () => {
    const html = documentHtml("L&rsquo;acc&egrave;s aux d&eacute;bats " + exposeBody);

    // &rsquo; is U+2019, the typographic apostrophe the AN actually uses.
    expect(extractExposeDesMotifs(extractBlockText(html))).toContain("L\u2019accès aux débats");
  });

  it("keeps paragraph breaks so the stored text stays readable", () => {
    const html = `<h2>EXPOSÉ DES MOTIFS</h2><p>${exposeBody}</p><p>${exposeBody}</p>`;

    expect(extractExposeDesMotifs(extractBlockText(html))).toContain("\n");
  });

  it("falls back to the head of the document when no section is found", () => {
    const text = extractBlockText(`<p>${"Texte sans section identifiable. ".repeat(10)}</p>`);

    expect(extractExposeDesMotifs(text)).toMatch(/^Texte sans section identifiable\./);
  });

  it("recognises a parliamentary text but not a maintenance page", () => {
    const maintenance = extractBlockText(
      `<html><body><h1>Assemblée nationale</h1><p>Le site est momentanément
       indisponible pour cause de maintenance technique. Nos équipes travaillent au
       rétablissement du service, merci de renouveler votre visite ultérieurement.</p>
       </body></html>`
    );

    // Long enough to clear the 100-char fallback threshold, so only the marker
    // keeps it out of exposeDesMotifs.
    expect(maintenance.length).toBeGreaterThan(100);
    expect(looksLikeParliamentaryDocument(maintenance)).toBe(false);
    expect(looksLikeParliamentaryDocument("PROPOSITION DE LOI visant à ...")).toBe(true);
    expect(looksLikeParliamentaryDocument("EXPOSÉ DES MOTIFS")).toBe(true);
  });

  it("returns null on a document too short to carry anything useful", () => {
    expect(extractExposeDesMotifs(extractBlockText("<p>Vide</p>"))).toBeNull();
  });

  it("ignores an exposé heading followed by no content", () => {
    expect(extractExposeDesMotifs("EXPOSÉ DES MOTIFS\nArticle 1er")).toBeNull();
  });
});

describe("downloadDocumentText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the document text on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<p>Mesdames,</p><p>Messieurs,</p>", { status: 200 })
    );

    await expect(downloadDocumentText("PIONANR5L17B3110")).resolves.toBe("Mesdames,\nMessieurs,");
  });

  it("returns null when the AN never published the text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" })
    );

    await expect(downloadDocumentText("PIONANR5L17B9999")).resolves.toBeNull();
  });
});

function maintenancePage(): Response {
  return new Response(
    "<html><body><p>Le site est momentanément indisponible pour cause de " +
      "maintenance technique, merci de renouveler votre visite plus tard.</p></body></html>",
    { status: 200 }
  );
}

/**
 * `checkedIndices` marks rows that already went through a prior sync attempt
 * (exposeCheckedAt non-null) — the rotation state a Senate-originated text
 * settles into once the AN endpoint has told it 404 once. Rows not listed
 * default to never-checked, the state a brand-new dossier starts in.
 */
function dossierRows(count: number, checkedIndices: number[] = []) {
  const checked = new Set(checkedIndices);
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    externalId: `DLR5L17N548${String(i).padStart(2, "0")}`,
    documentExternalId: `PIONANR5L17B310${i}`,
    title: `Dossier ${i}`,
    exposeCheckedAt: checked.has(i) ? new Date("2026-08-01T00:00:00Z") : null,
  }));
}

describe("syncLegislationContent batch failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    dbMock.legislativeDossier.findMany.mockResolvedValue([]);
    dbMock.legislativeDossier.update.mockReset();
  });

  function silenceLogs() {
    vi.spyOn(console, "log").mockImplementation(() => {});
  }

  it("stops at the first DNS failure instead of repeating it on every dossier", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(3));
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND gone.example.fr"), {
      code: "ENOTFOUND",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch failed", { cause }));
    silenceLogs();

    const error = await syncLegislationContent().catch((caught: unknown) => caught);

    // One dossier attempted, one request (no retry on a name that does not resolve).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(LegislationContentBatchError);
    expect((error as Error).message).toContain(`${DOCUMENT_HOST} does not resolve`);
    expect((error as LegislationContentBatchError).stats.processed).toBe(1);
    expect(dbMock.legislativeDossier.update).not.toHaveBeenCalled();
  });

  it("raises a whole batch of 404s as a broken URL scheme", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(6));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" })
    );
    silenceLogs();

    const error = await syncLegislationContent().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegislationContentBatchError);
    expect((error as Error).message).toContain("the open data URL scheme has most likely changed");
    expect((error as LegislationContentBatchError).stats.notFound).toBe(6);
  });

  it("does not raise a batch alert when a rotating pool of known-missing dossiers 404s again", async () => {
    // All six were already checked before (their prior sync attempt already
    // recorded a 404), so this run's 404s are the rotation revisiting known-dead
    // documents — a Senate-originated text requested against the AN endpoint,
    // for instance — not evidence that the endpoint just broke.
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(6, [0, 1, 2, 3, 4, 5]));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" })
    );
    silenceLogs();

    const result = await syncLegislationContent();

    expect(result.notFound).toBe(6);
    expect(result.errors).toEqual([]);
  });

  it("still raises the alert when never-checked dossiers 404 alongside recurring ones", async () => {
    // 5 fresh dossiers (never checked) plus 3 known-dead recurring ones: the
    // fresh ones failing is the real signal, regardless of how many recurring
    // 404s ride along in the same batch.
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(8, [5, 6, 7]));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" })
    );
    silenceLogs();

    const error = await syncLegislationContent().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegislationContentBatchError);
    expect((error as Error).message).toContain("5 never-checked-before documents answered 404");
  });

  it("stamps exposeCheckedAt on a definitive 404 so the dossier rotates to the back of the queue", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(1));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" })
    );
    silenceLogs();

    await syncLegislationContent();

    expect(dbMock.legislativeDossier.update).toHaveBeenCalledWith({
      where: { id: "id-0" },
      data: { exposeCheckedAt: expect.any(Date) },
    });
  });

  it("leaves exposeCheckedAt untouched on a transient network error, unlike a definitive 404", async () => {
    vi.useFakeTimers();
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(1));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket hang up"));
    silenceLogs();

    const resultPromise = syncLegislationContent();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.errors).toHaveLength(1);
    expect(dbMock.legislativeDossier.update).not.toHaveBeenCalled();
  });

  it("raises a whole batch of non-document pages served with HTTP 200", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(6));
    // A fresh Response per call: a body can only be consumed once.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => maintenancePage());
    silenceLogs();

    const error = await syncLegislationContent().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegislationContentBatchError);
    expect((error as Error).message).toContain("carried a parliamentary text");
    // Each page still rotates the dossier (exposeCheckedAt), but the maintenance
    // page's content must never reach the column read as official evidence.
    for (const call of dbMock.legislativeDossier.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty("exposeDesMotifs");
    }
  });

  it("stays silent when a single document is missing among successful ones", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(1));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" })
    );
    silenceLogs();

    const result = await syncLegislationContent();

    expect(result.notFound).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("stores the exposé of a real document", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue(dossierRows(1));
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          "<h1>PROPOSITION DE LOI</h1><h2>EXPOSÉ DES MOTIFS</h2><p>Mesdames, Messieurs, " +
            "la présente proposition de loi vise à renforcer l'information des citoyens.</p>" +
            "<h2>Article 1er</h2><p>Le code électoral est ainsi modifié.</p>",
          { status: 200 }
        )
    );
    silenceLogs();

    const result = await syncLegislationContent();

    expect(result.extracted).toBe(1);
    expect(dbMock.legislativeDossier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ exposeSource: "an-opendata" }),
      })
    );
  });
});
