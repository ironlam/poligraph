import { describe, it, expect } from "vitest";
import { sanitizeGovernmentTitle } from "./government-title";

describe("sanitizeGovernmentTitle", () => {
  it("drops the next person's entry glued onto a merged row", () => {
    // Real value from the upstream CSV, row 350: Pierre Messmer's title runs
    // straight into André Bettencourt's name and title, with no separator.
    const glued =
      "Premier ministre, Garde des sceaux, ministre de la justice par intérimAndré BettencourtMinistre délégué auprès du ministre des affaires étrangères, Ministre des affaires étrangères par intérim";

    expect(sanitizeGovernmentTitle(glued)).toBe(
      "Premier ministre, Garde des sceaux, ministre de la justice par intérim"
    );
  });

  it("leaves an ordinary title untouched", () => {
    expect(sanitizeGovernmentTitle("Ministre de l'agriculture et du développement rural")).toBe(
      "Ministre de l'agriculture et du développement rural"
    );
  });

  it("keeps a capital that follows an apostrophe", () => {
    expect(sanitizeGovernmentTitle("Secrétaire d'État aux transports")).toBe(
      "Secrétaire d'État aux transports"
    );
  });

  it("keeps a capital that follows a hyphen", () => {
    expect(sanitizeGovernmentTitle("Ministre des Outre-mer")).toBe("Ministre des Outre-mer");
  });

  it("keeps a capital that opens a new clause after a comma", () => {
    expect(sanitizeGovernmentTitle("Ministre d'État, chargé de la défense nationale")).toBe(
      "Ministre d'État, chargé de la défense nationale"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeGovernmentTitle("  Premier ministre  ")).toBe("Premier ministre");
  });

  it("survives an empty value", () => {
    expect(sanitizeGovernmentTitle("")).toBe("");
  });
});
