import { describe, it, expect } from "vitest";
import { buildRetourParam, parseReturn } from "@/lib/affairs/listing-return";

describe("buildRetourParam", () => {
  it("keeps active whitelisted filters in a stable order", () => {
    const value = buildRetourParam({
      certainty: "ETABLI",
      supercat: "PROBITE",
      search: "",
      sort: undefined,
    });
    expect(value).toBe("certainty=ETABLI&supercat=PROBITE");
  });

  it("drops empty and unknown keys", () => {
    const value = buildRetourParam({ parti: "", evil: "x", mode: "victime" } as Record<
      string,
      string
    >);
    expect(value).toBe("mode=victime");
  });

  it("returns an empty string for the bare listing", () => {
    expect(buildRetourParam({})).toBe("");
  });
});

describe("parseReturn", () => {
  it("rebuilds the filtered href and a counted label", () => {
    const r = parseReturn("certainty=ETABLI&supercat=PROBITE", "12");
    expect(r.href).toBe("/affaires?certainty=ETABLI&supercat=PROBITE");
    expect(r.label).toBe("Retour aux 12 résultats");
    expect(r.count).toBe(12);
    expect(r.filtered).toBe(true);
  });

  it("formats the count in fr-FR with a non-breaking thousands separator", () => {
    const r = parseReturn("", "1234");
    expect(r.label).toBe(`Retour aux ${(1234).toLocaleString("fr-FR")} résultats`);
  });

  it("falls back to the bare listing with no retour", () => {
    const r = parseReturn(null, null);
    expect(r.href).toBe("/affaires");
    expect(r.label).toBe("Retour aux affaires");
    expect(r.count).toBeNull();
    expect(r.filtered).toBe(false);
  });

  it("names a filtered origin even without a count", () => {
    const r = parseReturn("parti=lfi", null);
    expect(r.href).toBe("/affaires?parti=lfi");
    expect(r.label).toBe("Retour à la liste filtrée");
  });

  it("singularises a lone result", () => {
    expect(parseReturn("certainty=ETABLI", "1").label).toBe("Retour au résultat");
  });

  it("strips non-whitelisted keys from a crafted retour value", () => {
    const r = parseReturn("certainty=ETABLI&redirect=https://evil.test", "5");
    expect(r.href).toBe("/affaires?certainty=ETABLI");
  });

  it("ignores a non-numeric count", () => {
    const r = parseReturn("", "abc");
    expect(r.count).toBeNull();
  });
});
