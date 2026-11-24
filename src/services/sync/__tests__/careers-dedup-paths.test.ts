import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The mandate phase exists twice: in the service (Inngest) and in scripts/sync-careers.ts, which the
 * weekly "Sync Politicians" workflow runs. Only the service used the dedup guard, so the Sunday job
 * tried to create a second active senator mandate and failed on Mandate_current_type_uq four weeks
 * in a row (October and November 2026).
 */
describe("mandate dedup guard, every sync path", () => {
  for (const path of ["src/services/sync/careers.ts", "scripts/sync-careers.ts"]) {
    it(`${path} checks isDuplicateMandateCandidate before creating a mandate`, () => {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/isDuplicateMandateCandidate\(politician\.mandates,/);
    });
  }
});
