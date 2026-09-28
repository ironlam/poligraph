import { describe, expect, it } from "vitest";
import { shouldApplyGroupParty } from "../group-party";

describe("shouldApplyGroupParty", () => {
  it("fills a politician who has no party yet", () => {
    expect(shouldApplyGroupParty(null, "eelv")).toBe(true);
  });

  it("never replaces the party the careers sync set", () => {
    // danielle-simonnet: L'Après per Wikidata, Écologiste group whose default party is EELV.
    expect(shouldApplyGroupParty("lapres", "eelv")).toBe(false);
  });

  it("does not rewrite a party that already matches", () => {
    expect(shouldApplyGroupParty("ps", "ps")).toBe(false);
  });

  it("never clears a party when the group has no default party", () => {
    expect(shouldApplyGroupParty("ps", null)).toBe(false);
    expect(shouldApplyGroupParty(null, null)).toBe(false);
  });
});
