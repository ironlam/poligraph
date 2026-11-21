import { describe, expect, it } from "vitest";
import { buildFactchecksPoliticianRedirect } from "./factchecks-politician-redirect";

const target = (query: string) => buildFactchecksPoliticianRedirect(new URLSearchParams(query));

describe("buildFactchecksPoliticianRedirect", () => {
  it("renvoie la vue d'une personnalité vers sa page", () => {
    expect(target("politician=gabriel-attal")).toBe("/factchecks/politique/gabriel-attal");
  });

  it("laisse tomber les autres paramètres de l'ancienne vue", () => {
    expect(target("politician=gabriel-attal&directOnly=1&verdict=faux&page=2")).toBe(
      "/factchecks/politique/gabriel-attal"
    );
  });

  it("ne redirige pas le listing sans personnalité", () => {
    expect(target("")).toBeNull();
    expect(target("verdict=faux")).toBeNull();
    expect(target("politician=")).toBeNull();
  });

  it("refuse un slug qui sortirait de la route", () => {
    expect(target("politician=..%2Fadmin")).toBeNull();
    expect(target("politician=a%2Fb")).toBeNull();
    expect(target("politician=https://exemple.org")).toBeNull();
  });
});
