import { AsyncLocalStorage } from "node:async_hooks";

/** Closed vocabulary: never add caller input to an operation name. */
export const READ_OPERATIONS = [
  "measures.election.full",
  "presidential.hub.load",
  "presidential.field.load",
  "presidential.themes.load",
  "presidential.subject.load",
  "presidential.comparison.context.load",
  "presidential.comparison.page.load",
  "presidential.priorities.load",
  "presidential.reader-guides.load",
  "elections.details.load",
  "elections.details.http",
  "presidential.snapshots.sync",
  "presidential.probity.load",
] as const;
export type ReadOperation = (typeof READ_OPERATIONS)[number];
export type ExecutionContext = "web" | "build" | "scheduled" | "script" | "unknown";

type Collector = {
  operation: ReadOperation;
  parent: ReadOperation | null;
  root: ReadOperation;
  probability: number;
  context: ExecutionContext;
  sampled: boolean;
  closed: boolean;
  driverCalls: number;
  driverSucceeded: number;
  driverFailed: number;
  driverRows: number;
  unsupportedCalls: number;
};

const processState = globalThis as typeof globalThis & {
  poligraphReadTelemetryV1?: {
    storage: AsyncLocalStorage<Collector>;
    windowStart: number;
    emitted: number;
    suppressed: number;
    emissionFailures: number;
  };
};
const state = (processState.poligraphReadTelemetryV1 ??= {
  storage: new AsyncLocalStorage<Collector>(),
  windowStart: 0,
  emitted: 0,
  suppressed: 0,
  emissionFailures: 0,
});
const { storage } = state;

export function executionContext(hint?: ExecutionContext): ExecutionContext {
  // NODE_ENV=production also applies to prerendering. Only explicit execution evidence counts.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.DB_READ_CONTEXT === "build"
  ) {
    return "build";
  }
  const configured = process.env.DB_READ_CONTEXT;
  if (["web", "scheduled", "script", "unknown"].includes(configured ?? "")) {
    return configured as ExecutionContext;
  }
  return hint ?? "unknown";
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value === undefined || value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

// One bounded state per process instance, no timer or queued event payloads.
const MAX_EVENT_BYTES = 2048;

function emit(summary: Record<string, unknown>) {
  try {
    const now = Date.now();
    const windowMs = boundedNumber(process.env.DB_READ_WINDOW_MS, 60_000, 1000, 3_600_000);
    const limit = Math.floor(boundedNumber(process.env.DB_READ_MAX_EVENTS, 60, 1, 10_000));
    if (now - state.windowStart >= windowMs) {
      state.windowStart = now;
      state.emitted = 0;
    }
    if (state.emitted >= limit) {
      state.suppressed = Math.min(Number.MAX_SAFE_INTEGER, state.suppressed + 1);
      return;
    }
    const event = JSON.stringify({
      ...summary,
      suppressedSinceLastEmission: state.suppressed,
      emissionFailuresSinceLastEmission: state.emissionFailures,
      windowMs,
      instanceEventLimit: limit,
      lastSlotInWindow: state.emitted + 1 === limit,
    });
    state.emitted += 1;
    if (Buffer.byteLength(event) > MAX_EVENT_BYTES) {
      state.suppressed = Math.min(Number.MAX_SAFE_INTEGER, state.suppressed + 1);
      return;
    }
    console.info(event);
    state.suppressed = 0;
    state.emissionFailures = 0;
  } catch {
    state.emissionFailures = Math.min(Number.MAX_SAFE_INTEGER, state.emissionFailures + 1);
  }
}

/** Exclusive SQL attribution; nested durations remain inclusive and must not be summed. */
export async function observeRead<T>(
  operation: ReadOperation,
  work: () => Promise<T>,
  hint?: ExecutionContext
): Promise<T> {
  if (process.env.DB_READ_TELEMETRY !== "true" || !READ_OPERATIONS.includes(operation))
    return work();
  const parent = storage.getStore();
  const probability =
    parent?.probability ?? boundedNumber(process.env.DB_READ_SAMPLE_RATE, 0.1, 0, 1);
  const collector: Collector = {
    operation,
    parent: parent?.operation ?? null,
    root: parent?.root ?? operation,
    probability,
    context: parent?.context ?? executionContext(hint),
    sampled: parent?.sampled ?? (probability > 0 && Math.random() < probability),
    closed: false,
    driverCalls: 0,
    driverSucceeded: 0,
    driverFailed: 0,
    driverRows: 0,
    unsupportedCalls: 0,
  };
  const started = performance.now();
  let success = false;
  try {
    // PrismaPromise is lazy: assimilate it inside the scope, not after AsyncLocalStorage.run exits.
    const result = await storage.run(collector, async () => await work());
    success = true;
    return result;
  } finally {
    collector.closed = true;
    if (collector.sampled) {
      const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
      const environment = process.env.DB_READ_ENVIRONMENT ?? process.env.VERCEL_ENV;
      emit({
        event: "db.read.operation",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        operation,
        parent: collector.parent,
        root: collector.root,
        environment:
          environment === "production"
            ? "production"
            : environment === "preview"
              ? "preview"
              : "local",
        context: collector.context,
        release: release && /^[a-f0-9]{40}$/i.test(release) ? release : null,
        sampleProbability: probability,
        success,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        driverCalls: collector.driverCalls,
        driverSucceeded: collector.driverSucceeded,
        driverFailed: collector.driverFailed,
        driverRows: collector.driverRows,
        unsupportedCalls: collector.unsupportedCalls,
        coverage: "scoped-pg-buffered-v1",
        prismaOperations: null,
        prismaObjects: null,
        serverStatements: null,
        pendingDriverCalls:
          collector.driverCalls - collector.driverSucceeded - collector.driverFailed,
      });
    }
  }
}

/** Capture before dispatch; completions must never consult the current async context. */
export function captureDriverRead() {
  const collector = storage.getStore();
  if (!collector?.sampled || collector.closed) return;
  collector.driverCalls += 1;
  return (error: unknown, result: unknown) => {
    if (collector.closed) return;
    if (error != null) {
      collector.driverFailed += 1;
      return;
    }
    collector.driverSucceeded += 1;
    const results: unknown[] = Array.isArray(result) ? result : [result];
    for (const item of results) {
      if (item && typeof item === "object" && "rows" in item && Array.isArray(item.rows)) {
        collector.driverRows += item.rows.length;
      } else {
        collector.unsupportedCalls += 1;
      }
    }
  };
}

export function recordUnsupportedDriverRead() {
  const collector = storage.getStore();
  if (collector?.sampled && !collector.closed) collector.unsupportedCalls += 1;
}
