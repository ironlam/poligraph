import { describe, expect, it } from "vitest";
import { daysUntil } from "../countdown";

describe("daysUntil", () => {
  const target = new Date("2027-04-11T06:00:00Z");

  it("arrondit au jour supérieur", () => {
    expect(daysUntil(target, new Date("2027-04-10T07:00:00Z"))).toBe(1);
    expect(daysUntil(target, new Date("2027-04-09T07:00:00Z"))).toBe(2);
  });

  it("devient nul puis négatif une fois la date passée", () => {
    expect(daysUntil(target, target)).toBe(0);
    expect(daysUntil(target, new Date("2027-04-12T07:00:00Z"))).toBeLessThan(0);
  });
});
