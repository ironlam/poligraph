import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticleScraper } from "../article-scraper";

/**
 * Invariants du scraper : accès anonyme uniquement, sources à accès
 * restreint exclues, robot identifié par un User-Agent nommant le projet.
 */

const SCRAPER_SOURCE = readFileSync(join(__dirname, "..", "article-scraper.ts"), "utf8");

describe("ArticleScraper — sources autorisées", () => {
  const scraper = getArticleScraper();

  it.each(["mediapart", "lemonde", "lefigaro", "mediacites"])(
    "refuse de scraper la source à accès restreint %s",
    (source) => {
      expect(scraper.canScrape(source)).toBe(false);
    }
  );

  it.each(["franceinfo", "liberation", "publicsenat", "lcp", "reporterre"])(
    "accepte la source en accès libre %s",
    (source) => {
      expect(scraper.canScrape(source)).toBe(true);
    }
  );

  it("retourne null sans requête réseau pour une source à accès restreint", async () => {
    await expect(
      scraper.extractArticle("https://www.mediapart.fr/journal/france/000000/x", "mediapart")
    ).resolves.toBeNull();
  });

  it("refuse googlenews, qui pointe vers des articles tiers", () => {
    expect(scraper.canScrape("googlenews")).toBe(false);
  });
});

describe("ArticleScraper — accès anonyme", () => {
  it("ne référence aucun identifiant d'accès éditeur", () => {
    expect(SCRAPER_SOURCE).not.toMatch(/MEDIAPART_EMAIL|MEDIAPART_PASSWORD/);
  });

  it("n'appelle aucun endpoint d'authentification éditeur", () => {
    expect(SCRAPER_SOURCE).not.toMatch(/login_check/);
  });

  it("n'envoie ni cookie de session ni en-tête Cookie", () => {
    expect(SCRAPER_SOURCE).not.toMatch(/["']Cookie["']\s*\]?\s*[:=]/);
    expect(SCRAPER_SOURCE).not.toMatch(/getSetCookie/);
  });

  it("s'identifie sous un User-Agent nommant le projet", () => {
    const browserUA = SCRAPER_SOURCE.match(/Mozilla\/5\.0[^"']*/g) ?? [];
    const dishonest = browserUA.filter((ua) => !ua.includes("Poligraph"));
    expect(dishonest).toEqual([]);
  });
});
