import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { captureDriverRead } from "@/lib/telemetry/read-operations";

const mocks = vi.hoisted(() => ({ groupBy: vi.fn(), upsert: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { affair: { groupBy: mocks.groupBy }, statsSnapshot: { upsert: mocks.upsert } },
}));

import { computePresidentialSnapshots } from "../compute-presidential-snapshots";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockResolvedValue(undefined);
  mocks.groupBy.mockResolvedValue([{ politicianId: "p1" }, { politicianId: "p2" }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("computePresidentialSnapshots", () => {
  it.each([false, true])(
    "exclut l'upsert des lectures, échec écriture : %s",
    async (writeFails) => {
      vi.stubEnv("DB_READ_TELEMETRY", "true");
      vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
      vi.stubEnv("DB_READ_MAX_EVENTS", "10000");
      vi.stubEnv("DB_READ_CONTEXT", "");
      vi.stubEnv("NEXT_PHASE", "");
      vi.stubEnv("GITHUB_EVENT_NAME", "schedule");
      const events: Record<string, unknown>[] = [];
      vi.spyOn(console, "info").mockImplementation((line: string) => events.push(JSON.parse(line)));
      mocks.groupBy.mockImplementation(async () => {
        const complete = captureDriverRead();
        expect(complete).toBeDefined();
        complete?.(null, { rows: [{}, {}] });
        return [{ politicianId: "p1" }, { politicianId: "p2" }];
      });
      const error = new Error("private write failure");
      mocks.upsert.mockImplementation(async () => {
        expect(captureDriverRead()).toBeUndefined();
        expect(events).toHaveLength(2);
        if (writeFails) throw error;
        return { key: "private snapshot", data: { count: 2 } };
      });

      const result = computePresidentialSnapshots("presidentielle-2027");
      if (writeFails) await expect(result).rejects.toBe(error);
      else await expect(result).resolves.toMatchObject({ ok: true });

      expect(mocks.upsert).toHaveBeenCalledTimes(1);
      expect(events).toEqual([
        expect.objectContaining({
          operation: "presidential.probity.load",
          root: "presidential.snapshots.sync",
          context: "scheduled",
          driverCalls: 1,
          driverRows: 2,
          success: true,
        }),
        expect.objectContaining({
          operation: "presidential.snapshots.sync",
          context: "scheduled",
          driverCalls: 0,
          driverRows: 0,
          success: true,
        }),
      ]);
      expect(JSON.stringify(events)).not.toContain("private");
    }
  );

  it("écrit le compteur en mode normal", async () => {
    const result = await computePresidentialSnapshots("presidentielle-2027");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(result.computed).toHaveLength(1);
  });

  it("n'écrit rien en dry-run", async () => {
    // `.env` points at production on this project, so a preview run must not mutate it.
    const result = await computePresidentialSnapshots("presidentielle-2027", { dryRun: true });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(result.computed).toHaveLength(1);
  });
});
