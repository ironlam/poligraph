import { createServer, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservedPool } from "../pg-pool";
import { isPoolerRefusal } from "../pool-exhaustion";

const EMAXCONN = {
  code: "XX000",
  message: "(EMAXCONN) max client connections reached, limit: 400",
};
const BACKEND_TIMEOUT = {
  code: "08006",
  message: "Failed to connect to database: {:error, :timeout}",
};
const BAD_PASSWORD = { code: "28P01", message: "password authentication failed" };

type Refusal = { code: string; message: string };

function errorResponse({ code, message }: Refusal): Buffer {
  const fields = Buffer.from(`SFATAL\0C${code}\0M${message}\0\0`, "utf8");
  const header = Buffer.alloc(5);
  header.write("E");
  header.writeInt32BE(fields.length + 4, 1);
  return Buffer.concat([header, fields]);
}

// AuthenticationOk then ReadyForQuery: all a pg client needs to consider itself connected.
const ACCEPT = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]);

/**
 * Speaks just enough of the PostgreSQL startup exchange to answer the way the pooler does: the
 * first `refusals` connections get an error at startup, the following ones are accepted.
 */
async function startPooler(refusals: Refusal[], answerAfterMs = 0) {
  const sockets = new Set<Socket>();
  let attempts = 0;
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.once("data", () => {
      const refusal = refusals[attempts++];
      setTimeout(() => {
        if (refusal) socket.end(errorResponse(refusal));
        else socket.write(ACCEPT);
      }, answerAfterMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    attempts: () => attempts,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

let pooler: Awaited<ReturnType<typeof startPooler>> | undefined;
let pool: ObservedPool | undefined;

async function setup(
  refusals: Refusal[],
  { retryDelaysMs = [5, 5, 5], answerAfterMs = 0, connectionTimeoutMillis = 0 } = {}
) {
  pooler = await startPooler(refusals, answerAfterMs);
  pool = new ObservedPool(
    {
      host: "127.0.0.1",
      port: pooler.port,
      user: "u",
      database: "d",
      ssl: false,
      max: 2,
      connectionTimeoutMillis,
    },
    retryDelaysMs
  );
  // A client dropped by the fake server at teardown must not surface as an unhandled error.
  pool.on("error", () => {});
  return { pooler, pool };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await pool?.end().catch(() => {});
  await pooler?.close();
  pool = undefined;
  pooler = undefined;
});

describe("ObservedPool face à un refus du pooler", () => {
  it("réessaie et obtient une connexion quand le pooler se libère", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, pooler } = await setup([EMAXCONN, EMAXCONN]);

    const client = await pool.connect();
    client.release();

    expect(pooler.attempts()).toBe(3);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain("[pg-pool]");
  });

  it("réessaie aussi par l'interface à rappel, celle de pool.query", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, pooler } = await setup([BACKEND_TIMEOUT]);

    const calls: unknown[] = [];
    await new Promise<void>((resolve) => {
      const returned = pool.connect((error, client, done) => {
        calls.push(error);
        expect(client).toBeDefined();
        done();
        resolve();
      });
      expect(returned).toBeUndefined();
    });
    // Leave room for a second, unwanted call of the callback.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(calls).toEqual([undefined]);
    expect(pooler.attempts()).toBe(2);
    // Released for real: the client is back in the pool and nobody is waiting for it.
    expect(pool.idleCount).toBe(1);
    expect(pool.waitingCount).toBe(0);
  });

  it("rend l'erreur d'origine quand le pooler refuse jusqu'au bout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, pooler } = await setup([EMAXCONN, EMAXCONN, EMAXCONN, EMAXCONN, EMAXCONN]);

    await expect(pool.connect()).rejects.toThrow("EMAXCONN");
    // One first attempt, then one per configured delay, and no more.
    expect(pooler.attempts()).toBe(4);
  });

  it("ne relance plus une fois le délai de connexion écoulé", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Each refusal takes 200 ms to arrive and the budget is 300 ms: the first leaves room for a
    // retry, the second arrives past the budget, and the two remaining retries must not start.
    const { pool, pooler } = await setup([EMAXCONN, EMAXCONN, EMAXCONN, EMAXCONN], {
      answerAfterMs: 200,
      connectionTimeoutMillis: 300,
    });

    await expect(pool.connect()).rejects.toThrow("EMAXCONN");
    expect(pooler.attempts()).toBe(2);
  });

  it("rend le refus sans réessayer quand le pool est fermé pendant l'attente", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, pooler } = await setup([EMAXCONN, EMAXCONN], { retryDelaysMs: [200] });

    const acquisition = pool.connect();
    const settled = expect(acquisition).rejects.toThrow("EMAXCONN");
    await vi.waitFor(() => expect(pooler.attempts()).toBe(1));
    // Let the refusal reach the pool, which then starts waiting, and close during that wait.
    await new Promise((resolve) => setTimeout(resolve, 30));
    await pool.end();

    await settled;
    expect(pooler.attempts()).toBe(1);
  });

  it("ne réessaie pas une erreur qui n'est pas un refus du pooler", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, pooler } = await setup([BAD_PASSWORD, BAD_PASSWORD]);

    await expect(pool.connect()).rejects.toThrow("password authentication failed");
    expect(pooler.attempts()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isPoolerRefusal", () => {
  it("reconnaît les deux refus vus en production", () => {
    expect(isPoolerRefusal(Object.assign(new Error(EMAXCONN.message), { code: "XX000" }))).toBe(
      true
    );
    expect(
      isPoolerRefusal(Object.assign(new Error(BACKEND_TIMEOUT.message), { code: "08006" }))
    ).toBe(true);
  });

  it("laisse passer le reste, y compris un 08006 du pooler pour un autre motif", () => {
    const refusal = (message: string, code?: string) => Object.assign(new Error(message), { code });
    expect(isPoolerRefusal(refusal("timeout exceeded when trying to connect"))).toBe(false);
    expect(isPoolerRefusal(refusal("connection failure", "08006"))).toBe(false);
    expect(
      isPoolerRefusal(refusal("Failed to connect to database: {:error, :econnrefused}", "08006"))
    ).toBe(false);
    // The word alone is not enough: the pooler sends it with its own SQLSTATE.
    expect(isPoolerRefusal(refusal("EMAXCONN", "28P01"))).toBe(false);
    expect(isPoolerRefusal(refusal(EMAXCONN.message))).toBe(false);
    expect(isPoolerRefusal(undefined)).toBe(false);
  });
});
