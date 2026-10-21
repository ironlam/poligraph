import { describe, expect, it } from "vitest";
import { getRateLimitTier } from "./proxy";

describe("palier du formulaire de retour", () => {
  it("limite /api/feedback par son propre palier, plus strict que le général", () => {
    expect(getRateLimitTier("/api/feedback")).toBe("feedback");
    expect(getRateLimitTier("/api/search")).not.toBe("feedback");
  });
});
