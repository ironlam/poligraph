import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CcomptesError,
  fetchFluxJuridiction,
  fetchPagePublication,
  parseFluxCcomptes,
  publicationUrl,
} from "./ccomptes";

const FIXTURE = readFileSync(
  join(process.cwd(), "src/lib/api/__fixtures__/ccomptes/juridiction-143.xml"),
  "utf8"
);

function rss(items: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>J</title>${items}</channel></rss>`;
}

const PUB = "https://www.ccomptes.fr/fr/publications/a";
const DATE = "Fri, 20 Nov 2026 08:38:36 +0100";
const item = (title: string, pubDate = DATE) =>
  `<item><title>${title}</title><link>${PUB}</link><pubDate>${pubDate}</pubDate></item>`;

describe("parseFluxCcomptes, flux réel de la chambre Grand Est", () => {
  const flux = parseFluxCcomptes(FIXTURE);

  it("garde les publications et écarte l'actualité de la chambre", () => {
    expect(flux.publications.map((p) => p.titre)).toEqual([
      "Département de la Meuse",
      "Commune de Minorville (Meurthe-et-Moselle)",
    ]);
    expect(flux.ignores).toBe(1);
  });

  it("lit l'adresse et la date avec son fuseau", () => {
    expect(flux.publications[0]).toEqual({
      titre: "Département de la Meuse",
      url: "https://www.ccomptes.fr/fr/publications/departement-de-la-meuse-5",
      publieLe: new Date("2026-11-21T13:33:39Z"),
    });
  });
});

describe("parseFluxCcomptes, cas limites", () => {
  it("décode les entités XML du titre et resserre les blancs", () => {
    const flux = parseFluxCcomptes(rss(item("Commune d&apos;Aizier\n  (Eure) &amp; co")));
    expect(flux.publications[0]?.titre).toBe("Commune d'Aizier (Eure) & co");
  });

  it("lit une date suivie d'un retour à la ligne, comme dans le flux réel", () => {
    const flux = parseFluxCcomptes(rss(item("T", "Thu, 19 Nov 2026 09:48:11 +0100\n")));
    expect(flux.publications[0]?.publieLe.toISOString()).toBe("2026-11-19T08:48:11.000Z");
  });

  it("écarte une date illisible ou un titre vide", () => {
    expect(parseFluxCcomptes(rss(item("T", "hier") + item("")))).toEqual({
      publications: [],
      ignores: 2,
    });
  });

  it("refuse un document qui déclare une DTD, sans rien développer", () => {
    const dtd = '<!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;">]>';
    expect(() => parseFluxCcomptes(dtd + rss(item("&b;")).replace(/^<\?xml[^>]*>/, ""))).toThrow(
      /DTD/
    );
  });

  it("refuse une page HTML à la place du flux", () => {
    expect(() => parseFluxCcomptes("<html><body>Maintenance</body></html>")).toThrow(CcomptesError);
  });
});

describe("publicationUrl", () => {
  it.each([
    "http://www.ccomptes.fr/fr/publications/a",
    "https://ccomptes.fr/fr/publications/a",
    "https://www.ccomptes.fr.evil.example/fr/publications/a",
    "https://www.ccomptes.fr:8443/fr/publications/a",
    "https://user@www.ccomptes.fr/fr/publications/a",
    "https://www.ccomptes.fr/fr/publications/a?x=1",
    "https://www.ccomptes.fr/fr/actualites/a",
    "https://www.ccomptes.fr/fr/publications/../../admin",
    "https://www.ccomptes.fr/sites/default/files/2026-11/x.pdf",
    "javascript:alert(1)",
  ])("refuse %s", (raw) => {
    expect(publicationUrl(raw)).toBeNull();
  });

  it("accepte une page de publication", () => {
    expect(
      publicationUrl(" https://www.ccomptes.fr/fr/publications/commune-de-chartres-eure-et-loir-4 ")
    ).toBe("https://www.ccomptes.fr/fr/publications/commune-de-chartres-eure-et-loir-4");
  });
});

describe("fetchFluxJuridiction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(body: BodyInit, init: ResponseInit = {}) {
    const fetchMock = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/rss+xml; charset=utf-8" },
          ...init,
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("appelle l'adresse fixe de la chambre, sans suivre de redirection", async () => {
    const fetchMock = serve(FIXTURE);
    const flux = await fetchFluxJuridiction(143);
    expect(flux.publications).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.ccomptes.fr/fr/rss/juridiction/143");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuse une juridiction hors registre sans toucher au réseau", async () => {
    const fetchMock = serve(FIXTURE);
    await expect(fetchFluxJuridiction(98)).rejects.toMatchObject({ kind: "REQUETE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coupe un corps qui dépasse la taille maximale", async () => {
    serve(FIXTURE);
    await expect(fetchFluxJuridiction(143, { maxBytes: 100 })).rejects.toMatchObject({
      kind: "LIMITE",
    });
  });

  it("signale une erreur HTTP et une réponse qui n'est pas du XML", async () => {
    serve("", { status: 503 });
    await expect(fetchFluxJuridiction(143)).rejects.toMatchObject({ kind: "RESEAU" });
    serve("<html></html>", { headers: { "content-type": "text/html" } });
    await expect(fetchFluxJuridiction(143)).rejects.toMatchObject({ kind: "REPONSE" });
  });

  it("transforme un échec réseau en erreur typée", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    await expect(fetchFluxJuridiction(143)).rejects.toMatchObject({ kind: "RESEAU" });
  });

  it("lit une page de rapport et refuse toute autre adresse sans appel réseau", async () => {
    const fetchMock = serve("<html></html>", { headers: { "content-type": "text/html" } });
    await expect(fetchPagePublication(PUB)).resolves.toBe("<html></html>");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(PUB);
    await expect(
      fetchPagePublication("https://evil.example/fr/publications/a")
    ).rejects.toMatchObject({
      kind: "REQUETE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
