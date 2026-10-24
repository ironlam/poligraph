import { describe, expect, it } from "vitest";
import { CHAMBER_COMPARISON, CHAMBER_PROFILES, chamberPath } from "@/config/chambres";
import { ROUTES } from "@/config/routes";

describe("chambres", () => {
  it("serves each chamber from the route declared in ROUTES", () => {
    expect(chamberPath("AN")).toBe(ROUTES.assembleeNationale);
    expect(chamberPath("SENAT")).toBe(ROUTES.senat);
  });

  it("gives both chambers the same page structure", () => {
    const an = CHAMBER_PROFILES.AN;
    const senat = CHAMBER_PROFILES.SENAT;
    expect(an.roles).toHaveLength(senat.roles.length);
    expect(an.facts).toHaveLength(senat.facts.length);
  });

  it("states the seat counts the comparison table relies on", () => {
    expect(CHAMBER_PROFILES.AN.members).toBe("577");
    expect(CHAMBER_PROFILES.SENAT.members).toBe("348");
    const seats = CHAMBER_COMPARISON.find((r) => r.question === "Combien d'élus ?");
    expect(seats).toEqual({
      question: "Combien d'élus ?",
      senat: "348 sénateurs",
      an: "577 députés",
    });
  });

  it("never uses em or en dashes in editorial copy", () => {
    const text = JSON.stringify([CHAMBER_PROFILES, CHAMBER_COMPARISON]);
    expect(text).not.toMatch(/[—–]/);
  });
});
