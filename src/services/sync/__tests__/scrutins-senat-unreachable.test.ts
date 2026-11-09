import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { externalId: { findMany: vi.fn().mockResolvedValue([]) } },
}));

vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText() {
      return Promise.reject(new Error("fetch failed: timeout"));
    }
    get() {
      return Promise.reject(new Error("fetch failed: timeout"));
    }
  },
}));

import { syncScrutinsSenat } from "@/services/sync/scrutins-senat";

describe("sync des scrutins du Sénat quand senat.fr est injoignable", () => {
  it("remonte une erreur au lieu de finir en succès avec 0 scrutin", async () => {
    const stats = await syncScrutinsSenat(2026, true, false, false);

    expect(stats.scrutinsProcessed).toBe(0);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain("Session 2026");
    expect(stats.errors[0]).toContain("timeout");
  });
});
