import { describe, it, expect } from "vitest";
import { pickDisplayMandate, formatMandateMeta } from "@/lib/affairs/context-meta";

describe("pickDisplayMandate", () => {
  it("prefers a parliamentary mandate over another current one", () => {
    const m = pickDisplayMandate([
      { type: "MINISTRE", constituency: null, startDate: new Date("2020-01-01") },
      { type: "SENATEUR", constituency: "Moselle", startDate: new Date("2017-09-01") },
    ]);
    expect(m?.type).toBe("SENATEUR");
  });

  it("falls back to the first when none is parliamentary", () => {
    const m = pickDisplayMandate([{ type: "MAIRE", constituency: "Lyon", startDate: null }]);
    expect(m?.type).toBe("MAIRE");
  });

  it("returns null with no mandate", () => {
    expect(pickDisplayMandate([])).toBeNull();
  });
});

describe("formatMandateMeta", () => {
  it("names the chamber and the seniority year", () => {
    const meta = formatMandateMeta(
      { type: "SENATEUR", constituency: "Moselle", startDate: new Date("2017-09-01") },
      "Mme"
    );
    expect(meta).toContain("Sénat");
    expect(meta).toContain("Moselle");
    expect(meta).toContain("en mandat depuis 2017");
  });

  it("omits the department segment when unknown (MissingData)", () => {
    const meta = formatMandateMeta({ type: "DEPUTE", constituency: null, startDate: null }, "M.");
    expect(meta).toContain("Assemblée nationale");
    expect(meta).not.toContain(" ·  · ");
  });

  it("extracts the department from a parenthesised constituency", () => {
    const meta = formatMandateMeta(
      { type: "DEPUTE", constituency: "Rhône (3ème)", startDate: null },
      null
    );
    expect(meta).toContain("Rhône");
    expect(meta).not.toContain("3ème");
  });

  it("returns null without a mandate", () => {
    expect(formatMandateMeta(null, null)).toBeNull();
  });
});
