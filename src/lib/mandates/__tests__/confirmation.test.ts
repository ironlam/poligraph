import { describe, expect, it } from "vitest";

import { confirmedFromResourceUrl } from "@/lib/mandates/confirmation";

describe("confirmedFromResourceUrl", () => {
  it("lit la date de publication portée par l'URL", () => {
    expect(
      confirmedFromResourceUrl(
        "https://static.data.gouv.fr/resources/repertoire-national-des-elus-1/20260811-155100/elus-maire-mai.csv"
      )?.toISOString()
    ).toBe("2026-08-11T00:00:00.000Z");
  });

  it("rend null quand l'URL ne porte pas de date", () => {
    // Une date inventée serait pire que pas de date : elle serait comparée à celle des autres
    // sources et ferait passer un fichier ancien pour récent.
    expect(confirmedFromResourceUrl("https://example.test/elus.csv")).toBeNull();
    expect(confirmedFromResourceUrl("https://example.test/9999-1/elus.csv")).toBeNull();
  });
});
