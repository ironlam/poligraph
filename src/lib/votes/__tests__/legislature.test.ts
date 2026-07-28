import { describe, it, expect } from "vitest";
import { formatLegislature } from "@/lib/votes/legislature";

describe("formatLegislature", () => {
  it("libelle les législatures AN (numéros)", () => {
    expect(formatLegislature(17)).toBe("17ᵉ législature (depuis 2024)");
    expect(formatLegislature(16)).toBe("16ᵉ législature (2022-2024)");
    expect(formatLegislature(15)).toBe("15ᵉ législature (2017-2022)");
  });

  it("libelle les buckets Sénat (années) sans ordinal", () => {
    expect(formatLegislature(2023)).toBe("Sénat, depuis 2023");
    expect(formatLegislature(2020)).toBe("Sénat, 2020-2023");
    expect(formatLegislature(2017)).toBe("Sénat, 2017-2020");
  });

  it("dégrade proprement pour une valeur inconnue", () => {
    expect(formatLegislature(14)).toBe("14ᵉ législature");
  });
});
