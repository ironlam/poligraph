import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RSSClient, type RSSFeedConfig } from "./rss";

/**
 * Parse contract for the RSS feeds.
 *
 * **Rejoue des fixtures, n'appelle plus le réseau** (issue #643). Le test s'appelle « parse contract »,
 * donc son objet est l'analyse, pas la disponibilité de Mediacités : il était rouge quand un site tiers
 * tombait, quelle que soit la modification testée. Un rouge dont la cause est hors du dépôt apprend à
 * ignorer le rouge, et c'est par là qu'une vraie régression finit par passer pour un aléa.
 *
 * Trois fixtures, deux natures :
 *
 * - `bfmtv-politique.xml` est **capturé** d'un vrai flux, tronqué à trois items. Il garantit que les
 *   formes testées ici sont celles du monde réel et pas celles que j'imagine.
 * - les deux autres sont **écrites à la main** pour couvrir des cas limites que les flux du jour
 *   n'exhibent pas forcément, dont celui qui casse le plus souvent un parseur XML.
 *
 * Vérifier qu'un flux n'a pas changé de forme reste possible, à la demande : `RSS_NETWORK_CHECK=1`.
 */

const FIXTURES = join(process.cwd(), "src/lib/api/__fixtures__/rss");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.xml`), "utf8");
}

function feed(id: string): RSSFeedConfig {
  return { id, name: id, url: `https://example.org/${id}.xml`, priority: 2 };
}

/** Serves the fixture instead of the network, so nothing here depends on a third party. */
function serve(xml: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } })
    )
  );
}

describe("RSS parse contract", () => {
  const client = new RSSClient({ timeout: 5_000, retries: 0 });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("analyse un vrai flux capturé en items titre, lien, date", async () => {
    serve(fixture("bfmtv-politique"));

    const result = await client.fetchFeed(feed("bfmtv-politique"));

    expect(result.items.length).toBe(3);
    for (const item of result.items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.link).toMatch(/^https?:\/\//);
      expect(item.pubDate).toBeInstanceOf(Date);
      expect(Number.isNaN(item.pubDate.getTime())).toBe(false);
    }
  });

  it("ne perd pas l'article d'un flux qui n'en a qu'un", async () => {
    // Le cas limite qui compte : fast-xml-parser rend `item` comme un objet quand il n'y en a qu'un et
    // comme un tableau au-delà. Un parseur qui suppose toujours un tableau perd en silence le seul
    // article d'un flux calme.
    serve(fixture("un-seul-item"));

    const result = await client.fetchFeed(feed("un-seul-item"));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toContain("Un titre entre CDATA");
    expect(result.items[0]?.link).toBe("https://example.org/article-unique");
  });

  it("décode les entités HTML d'un titre", async () => {
    serve(fixture("entites-et-dates"));

    const result = await client.fetchFeed(feed("entites-et-dates"));

    // Une entité non décodée s'afficherait telle quelle sur le site, et l'accent français est
    // exactement ce que ce dépôt refuse de perdre.
    expect(result.items[0]?.title).toContain("fiscalité");
    expect(result.items[0]?.title).not.toContain("&amp;");
    expect(result.items[0]?.title).not.toContain("&eacute;");
  });

  it("analyse les deux formats de date que les flux mélangent", async () => {
    // Une date non analysée ressort en Invalid Date sans rien casser d'autre, donc en silence.
    serve(fixture("entites-et-dates"));

    const result = await client.fetchFeed(feed("entites-et-dates"));

    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(Number.isNaN(item.pubDate.getTime())).toBe(false);
    }
    expect(result.items[1]?.pubDate.toISOString()).toBe("2026-08-03T07:15:00.000Z");
  });
});

/**
 * La vérification de forme des vrais flux, sortie de la suite par défaut.
 *
 * C'est la seule chose que l'ancienne version testait vraiment : que le site répond aujourd'hui. Elle a
 * sa valeur, une fois de temps en temps, à la demande, jamais en CI.
 */
const networkCheck = process.env.RSS_NETWORK_CHECK === "1";

const LIVE_FEEDS: RSSFeedConfig[] = [
  {
    id: "reporterre",
    name: "Reporterre",
    url: "https://reporterre.net/spip.php?page=backend",
    priority: 2,
  },
  { id: "mediacites", name: "Mediacités", url: "https://www.mediacites.fr/feed/", priority: 2 },
  {
    id: "bfmtv-politique",
    name: "BFM politique",
    url: "https://www.bfmtv.com/rss/politique/",
    priority: 2,
  },
];

describe.skipIf(!networkCheck)("RSS : forme des flux réels (RSS_NETWORK_CHECK=1)", () => {
  const client = new RSSClient({ timeout: 25_000, retries: 1 });

  for (const config of LIVE_FEEDS) {
    it(`${config.id} répond et garde sa forme`, async () => {
      const result = await client.fetchFeed(config);

      expect(result.items.length).toBeGreaterThan(0);
      const first = result.items[0];
      expect(first?.link).toMatch(/^https?:\/\//);
      expect(Number.isNaN(first?.pubDate.getTime() ?? NaN)).toBe(false);
    }, 30_000);
  }
});
