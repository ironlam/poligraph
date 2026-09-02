import { describe, expect, it } from "vitest";
import { PRISMA_TRANSACTION_OPTIONS } from "../database";

describe("configuration des transactions Prisma", () => {
  it("laisse passer une transition dépassant le défaut Prisma de cinq secondes", () => {
    expect(PRISMA_TRANSACTION_OPTIONS.maxWait).toBe(5_000);
    expect(PRISMA_TRANSACTION_OPTIONS.timeout).toBe(15_000);
    expect(PRISMA_TRANSACTION_OPTIONS.timeout).toBeGreaterThan(6_000);
    expect(PRISMA_TRANSACTION_OPTIONS.timeout).toBeLessThan(30_000);
  });
});
