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
async function startPooler(refusals: Refusal[]) {
  const sockets = new Set<Socket>();
  let attempts = 0;
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.once("data", () => {
      const refusal = refusals[attempts++];
      if (refusal) socket.end(errorResponse(refusal));
      else socket.write(ACCEPT);
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

async function setup(refusals: Refusal[], retryDelaysMs = [5, 5, 5]) {
  pooler = await startPooler(refusals);
  pool = new ObservedPool(
    { host: "127.0.0.1", port: pooler.port, user: "u", database: "d", ssl: false, max: 2 },
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

    const outcome = await new Promise<{ error: unknown; released: boolean }>((resolve) => {
      pool.connect((error, client, done) => {
        done();
        resolve({ error, released: client !== undefined });
      });
    });

    expect(outcome.error).toBeFalsy();
    expect(outcome.released).toBe(true);
    expect(pooler.attempts()).toBe(2);
  });

  it("rend l'erreur d'origine quand le pooler refuse jusqu'au bout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, pooler } = await setup([EMAXCONN, EMAXCONN, EMAXCONN, EMAXCONN, EMAXCONN]);

    await expect(pool.connect()).rejects.toThrow("EMAXCONN");
    // One first attempt, then one per configured delay, and no more.
    expect(pooler.attempts()).toBe(4);
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

  it("laisse passer le reste, y compris un autre 08006", () => {
    expect(isPoolerRefusal(new Error("timeout exceeded when trying to connect"))).toBe(false);
    expect(isPoolerRefusal(Object.assign(new Error("connection failure"), { code: "08006" }))).toBe(
      false
    );
    expect(isPoolerRefusal(undefined)).toBe(false);
  });
});
