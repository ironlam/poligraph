import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool, type PoolConfig } from "pg";
import { captureDriverRead, recordUnsupportedDriverRead } from "./read-operations";

type Invocation = (...args: unknown[]) => unknown;

/** Pool's documented Client constructor seam, installed once, without changing pg prototypes. */
class ObservedClient extends Client {
  override query: Client["query"] = ((...args: unknown[]) => {
    // Cursors/Submittable objects have a different result contract; they are outside this scope.
    if (args[0] && typeof args[0] === "object" && "submit" in args[0]) {
      recordUnsupportedDriverRead();
      return (super.query as Invocation)(...args);
    }
    const record = captureDriverRead();
    if (!record) return (super.query as Invocation)(...args);
    const callback = args.at(-1);
    if (typeof callback === "function") {
      args[args.length - 1] = function (this: unknown, error: unknown, result: unknown) {
        record(error, result);
        return callback.call(this, error, result);
      };
      try {
        return (super.query as Invocation)(...args);
      } catch (error) {
        record(error, undefined);
        throw error;
      }
    }
    try {
      return Promise.resolve((super.query as Invocation)(...args)).then(
        (result) => {
          record(null, result);
          return result;
        },
        (error: unknown) => {
          record(error, undefined);
          throw error;
        }
      );
    } catch (error) {
      record(error, undefined);
      throw error;
    }
  }) as Client["query"];
}

export class ObservedPool extends Pool {
  constructor(config: PoolConfig) {
    super({ ...config, Client: ObservedClient });
  }

  // Pool.query acquires through this public callback API. A queued acquisition otherwise runs
  // under the releasing operation's context. Bind even the empty/unsampled context to prevent leaks.
  override connect: Pool["connect"] = ((...args: unknown[]) => {
    const callback = args[0];
    if (typeof callback === "function") args[0] = AsyncLocalStorage.bind(callback as Invocation);
    return (super.connect as Invocation)(...args);
  }) as Pool["connect"];
}
