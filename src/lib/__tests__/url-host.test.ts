import { describe, expect, it } from "vitest";
import { matchesHost } from "../url-host";

describe("matchesHost", () => {
  it("accepte l'hôte exact", () => {
    expect(matchesHost("https://wikipedia.org/wiki/Test", "wikipedia.org")).toBe(true);
  });

  it("accepte un sous-domaine", () => {
    expect(matchesHost("https://fr.wikipedia.org/wiki/Test", "wikipedia.org")).toBe(true);
  });

  /**
   * Le motif que CodeQL signale : `url.includes("wikipedia.org")` répond vrai ici alors que
   * l'hôte réellement contacté est evil.com.
   */
  it("refuse un hôte qui se contente de contenir la chaîne", () => {
    expect(matchesHost("https://evil.com/?ref=wikipedia.org", "wikipedia.org")).toBe(false);
    expect(matchesHost("https://wikipedia.org.evil.com/a", "wikipedia.org")).toBe(false);
    expect(matchesHost("https://notwikipedia.org/a", "wikipedia.org")).toBe(false);
  });

  it("refuse ce qui n'est pas une URL plutôt que de jeter", () => {
    expect(matchesHost("", "wikipedia.org")).toBe(false);
    expect(matchesHost("pas une url", "wikipedia.org")).toBe(false);
  });

  it("ignore la casse de l'hôte, que l'URL normalise", () => {
    expect(matchesHost("https://FR.Wikipedia.ORG/wiki/Test", "wikipedia.org")).toBe(true);
  });

  /**
   * Un nom d'hôte pleinement qualifié peut se terminer par un point, et `URL.hostname` le
   * conserve. Sans normalisation, `fr.wikipedia.org.` ne ressemble plus à Wikipedia alors que
   * la requête y arrive.
   */
  it("ignore le point terminal du nom d'hôte", () => {
    expect(matchesHost("https://fr.wikipedia.org./wiki/Test", "wikipedia.org")).toBe(true);
    expect(matchesHost("https://wikipedia.org./wiki/Test", "wikipedia.org")).toBe(true);
  });

  it("ne se laisse pas tromper par un point terminal sur un autre hôte", () => {
    expect(matchesHost("https://evil.com./?ref=wikipedia.org", "wikipedia.org")).toBe(false);
    expect(matchesHost("https://notwikipedia.org./a", "wikipedia.org")).toBe(false);
  });

  /** Les chaînes de connexion Postgres sont des URL : c'est ce qui sert côté scripts. */
  it("lit l'hôte d'une chaîne de connexion Postgres", () => {
    expect(
      matchesHost("postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:5432/db", "supabase.com")
    ).toBe(true);
  });
});
