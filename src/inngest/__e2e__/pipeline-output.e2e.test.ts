import { describe, expect, it, afterAll } from "vitest";
import { db } from "@/lib/db";

interface PipelineExpectation {
  name: string;
  sourceKey: string;
  maxStaleHours: number;
  minItemCount: number;
}

const EXPECTATIONS: PipelineExpectation[] = [
  { name: "press-analysis", sourceKey: "press-analysis", maxStaleHours: 30, minItemCount: 1 },
  {
    name: "votes-an-zip",
    sourceKey: "votes-an-zip:17:recent",
    maxStaleHours: 30,
    minItemCount: 0,
  },
  {
    name: "embeddings-factcheck",
    sourceKey: "embeddings:FACTCHECK",
    maxStaleHours: 30,
    minItemCount: 0,
  },
  {
    name: "embeddings-press",
    sourceKey: "embeddings:PRESS_ARTICLE",
    maxStaleHours: 30,
    minItemCount: 0,
  },
];

describe("Inngest pipeline output health", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  for (const expected of EXPECTATIONS) {
    it(`${expected.name} ran within ${expected.maxStaleHours}h and produced at least ${expected.minItemCount} items`, async () => {
      const row = await db.syncMetadata.findUnique({
        where: { sourceKey: expected.sourceKey },
      });
      expect(row, `SyncMetadata row missing for ${expected.sourceKey}`).not.toBeNull();
      expect(row!.lastSyncAt, `lastSyncAt missing for ${expected.sourceKey}`).not.toBeNull();
      const ageHours = (Date.now() - row!.lastSyncAt!.getTime()) / 3_600_000;
      expect(ageHours, `${expected.sourceKey} stale`).toBeLessThan(expected.maxStaleHours);
      if (expected.minItemCount > 0) {
        expect(row!.itemCount ?? 0).toBeGreaterThanOrEqual(expected.minItemCount);
      }
    });
  }
});
