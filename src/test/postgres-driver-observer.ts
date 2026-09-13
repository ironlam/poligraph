import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

/**
 * These metrics describe the rows received by the node-postgres driver. They are not PostgreSQL
 * protocol bytes and must not be read as billed egress.
 */
export type PostgresDriverMetrics = {
  queryCount: number;
  returnedRowCount: number;
  serializedDriverResultBytes: number;
};

type DriverResult = { rows?: unknown[] };
type Collector = PostgresDriverMetrics;

const operationContext = new AsyncLocalStorage<Collector>();
const originalClientQueries = new WeakMap<object, (...args: unknown[]) => unknown>();
let activeObservations = 0;

function recordResult(result: DriverResult | undefined, collector: Collector | undefined) {
  if (!collector || !result) return;

  const rows = Array.isArray(result.rows) ? [...result.rows] : [];
  collector.returnedRowCount += rows.length;
  const serialized = JSON.stringify(rows, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  collector.serializedDriverResultBytes += Buffer.byteLength(serialized ?? "null");
}

function installObservation() {
  if (activeObservations === 0) {
    // Pool.query delegates to a borrowed Client. Observing the execution seam once covers both
    // Pool.query and callers that explicitly use pool.connect(), without double-counting either.
    const prototype = pg.Client.prototype as unknown as Record<string, unknown>;
    const original = prototype.query as (...args: unknown[]) => unknown;
    originalClientQueries.set(prototype, original);

    prototype.query = function observedQuery(this: pg.Client, ...args: unknown[]) {
      const collector = operationContext.getStore();
      if (collector) collector.queryCount += 1;

      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (...callbackArgs: unknown[]) => {
          if (callbackArgs[0] == null) {
            recordResult(callbackArgs[1] as DriverResult | undefined, collector);
          }
          return callback(...callbackArgs);
        };
        return original.apply(this, args);
      }

      return Promise.resolve(original.apply(this, args)).then((result: unknown) => {
        recordResult(result as DriverResult, collector);
        return result;
      });
    };
  }
  activeObservations += 1;
}

function restoreObservation() {
  activeObservations -= 1;
  if (activeObservations !== 0) return;

  const prototype = pg.Client.prototype as unknown as Record<string, unknown>;
  const original = originalClientQueries.get(prototype);
  if (original) prototype.query = original;
  originalClientQueries.delete(prototype);
}

export async function measurePostgresDriverOperation<T>(operation: () => Promise<T>) {
  installObservation();
  const metrics: PostgresDriverMetrics = {
    queryCount: 0,
    returnedRowCount: 0,
    serializedDriverResultBytes: 0,
  };

  try {
    const result = await operationContext.run(metrics, operation);
    return { result, metrics: { ...metrics } };
  } finally {
    restoreObservation();
  }
}
