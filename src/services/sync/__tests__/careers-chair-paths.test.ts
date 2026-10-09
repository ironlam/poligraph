import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The P488 phase exists twice: in the service (Inngest) and in scripts/sync-careers.ts, which the
 * weekly "Sync Politicians" workflow runs. #1001 guarded only the service, so the Sunday job would
 * have recreated the invented leader mandates and current-party rewrites deleted on 2026-10-08.
 */
describe("P488 chair guard, every sync path", () => {
  for (const path of ["src/services/sync/careers.ts", "scripts/sync-careers.ts"]) {
    it(`${path} checks isCurrentChair and never dates a leadership today`, () => {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/isCurrentChair\(/);
      expect(source).not.toMatch(/startDate:\s*data\.startDate\s*\?\?\s*new Date\(\)/);
    });
  }
});
