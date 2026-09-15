// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureDriverRead, executionContext, observeRead } from "../read-operations";

let events: Record<string, unknown>[];
let testClock = Date.now();
beforeEach(() => {
  events = [];
  vi.stubEnv("DB_READ_TELEMETRY", "true");
  vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
  vi.stubEnv("DB_READ_MAX_EVENTS", "10000");
  vi.stubEnv("DB_READ_CONTEXT", "unknown");
  // Advance the limiter's real clock without replacing performance.now or creating live timers.
  testClock += 3_600_001;
  vi.spyOn(Date, "now").mockReturnValue(testClock);
  vi.spyOn(console, "info").mockImplementation((line: string) => events.push(JSON.parse(line)));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("read summaries", () => {
  it("preserves values, errors and emits no business content", async () => {
    const value = { private: "NEVER_LOG_THIS" };
    expect(
      await observeRead("measures.election.full", async () => {
        captureDriverRead()?.(null, { rows: [value, value] });
        return value;
      })
    ).toBe(value);
    const error = new Error("NEVER_LOG_THIS");
    await expect(
      observeRead("measures.election.full", async () => {
        captureDriverRead()?.(error, undefined);
        throw error;
      })
    ).rejects.toBe(error);
    expect(events[0]).toMatchObject({ driverCalls: 1, driverRows: 2, success: true });
    expect(events[1]).toMatchObject({ driverFailed: 1, driverRows: 0, success: false });
    expect(JSON.stringify(events)).not.toContain("NEVER_LOG_THIS");
    expect(events.every((event) => Buffer.byteLength(JSON.stringify(event)) <= 2048)).toBe(true);
  });

  it("disables without sampling, emitting or changing the result", async () => {
    vi.stubEnv("DB_READ_TELEMETRY", "false");
    const random = vi.spyOn(Math, "random");
    expect(
      await observeRead("measures.election.full", async () => {
        expect(captureDriverRead()).toBeUndefined();
        return 42;
      })
    ).toBe(42);
    expect(random).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("inherits one sample decision and counts nested queries exclusively", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.2);
    vi.stubEnv("DB_READ_SAMPLE_RATE", "0.5");
    await observeRead("presidential.hub.load", async () => {
      captureDriverRead()?.(null, { rows: [1] });
      await observeRead("presidential.themes.load", async () => {
        captureDriverRead()?.(null, { rows: [1, 2] });
      });
      captureDriverRead()?.(null, { rows: [1] });
    });
    expect(random).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      expect.objectContaining({
        operation: "presidential.themes.load",
        parent: "presidential.hub.load",
        driverRows: 2,
        driverCalls: 1,
        sampleProbability: 0.5,
      }),
      expect.objectContaining({
        operation: "presidential.hub.load",
        parent: null,
        driverRows: 2,
        driverCalls: 2,
      }),
    ]);
    events.length = 0;
    random.mockReturnValue(0.9);
    await observeRead("presidential.hub.load", async () => {
      vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
      await observeRead("presidential.themes.load", async () =>
        expect(captureDriverRead()).toBeUndefined()
      );
    });
    expect(events).toEqual([]);
  });

  it("caps per window and reports losses on the next emitted event", async () => {
    vi.stubEnv("DB_READ_MAX_EVENTS", "2");
    for (let i = 0; i < 5; i++) await observeRead("presidential.themes.load", async () => i);
    expect(events).toHaveLength(2);
    expect(events[1]?.lastSlotInWindow).toBe(true);
    vi.mocked(Date.now).mockReturnValue(Date.now() + 60_001);
    await observeRead("presidential.themes.load", async () => 1);
    expect(events[2]?.suppressedSinceLastEmission).toBe(3);
  });

  it("contains emitter failures and does not retry or mask application errors", async () => {
    vi.mocked(console.info).mockImplementationOnce(() => {
      throw new Error("sink failure");
    });
    expect(await observeRead("presidential.themes.load", async () => 42)).toBe(42);
    await observeRead("presidential.themes.load", async () => 1);
    expect(events[0]?.emissionFailuresSinceLastEmission).toBe(1);
    const error = new Error("application failure");
    vi.mocked(console.info).mockImplementationOnce(() => {
      throw new Error("sink failure");
    });
    await expect(
      observeRead("presidential.themes.load", async () => {
        throw error;
      })
    ).rejects.toBe(error);
  });

  it("does not infer production runtime from NODE_ENV and gives build evidence priority", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DB_READ_CONTEXT", "");
    expect(executionContext()).toBe("unknown");
    expect(executionContext("web")).toBe("web");
    vi.stubEnv("DB_READ_CONTEXT", "build");
    expect(executionContext("web")).toBe("build");
    vi.stubEnv("DB_READ_CONTEXT", "web");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(executionContext()).toBe("build");
  });

  it("rejects unregistered names and untrusted release values", async () => {
    // @ts-expect-error Closed names are also checked at runtime.
    await observeRead("private-person-id", async () => 1);
    expect(events).toEqual([]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "https://private.example/?secret=xxx");
    vi.stubEnv("VERCEL_ENV", "production");
    await observeRead("presidential.themes.load", async () => 1);
    expect(events[0]).toMatchObject({ release: null, environment: "production" });
  });
});
