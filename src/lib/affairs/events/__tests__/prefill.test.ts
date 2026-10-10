import { describe, expect, it } from "vitest";
import { eventPrefillHref, parseEventPrefill, type EventPrefill } from "../prefill";

function paramsOf(href: string) {
  return Object.fromEntries(new URL(href, "https://poligraph.fr").searchParams);
}

describe("eventPrefillHref et parseEventPrefill", () => {
  it("relit ce que le lien a écrit, sans date", () => {
    const prefill: EventPrefill = {
      type: "JUGEMENT",
      outcome: "CONDAMNATION",
      sourceUrl: "https://www.francetvinfo.fr/article?id=1&x=2",
      sourceKind: "PRESS",
    };
    const href = eventPrefillHref("aff_1", prefill);
    expect(href.startsWith("/admin/affaires/aff_1?")).toBe(true);
    expect(href.endsWith("#etapes")).toBe(true);
    expect(parseEventPrefill(paramsOf(href))).toEqual(prefill);
  });

  it("ouvre le formulaire même sans type déduit", () => {
    const href = eventPrefillHref("aff_1", {
      type: null,
      outcome: null,
      sourceUrl: null,
      sourceKind: null,
    });
    expect(parseEventPrefill(paramsOf(href))).toEqual({
      type: null,
      outcome: null,
      sourceUrl: null,
      sourceKind: null,
    });
  });

  it("ignore les valeurs forgées", () => {
    expect(
      parseEventPrefill({
        etape: "CONDAMNATION",
        issue: "ACQUITTE",
        source: "javascript:alert(1)",
        nature: "BLOG",
      })
    ).toEqual({ type: null, outcome: null, sourceUrl: null, sourceKind: null });
    expect(parseEventPrefill({ etape: "toString", source: "http://exemple.fr" })).toEqual({
      type: null,
      outcome: null,
      sourceUrl: null,
      sourceKind: null,
    });
  });

  it("n'ouvre rien sans le paramètre d'étape", () => {
    expect(parseEventPrefill({})).toBeNull();
    expect(parseEventPrefill({ source: "https://www.lemonde.fr/a" })).toBeNull();
  });
});
