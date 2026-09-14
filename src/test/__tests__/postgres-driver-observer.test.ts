import pg from "pg";
import { afterEach, expect, it } from "vitest";
import { measurePostgresDriverOperation } from "../postgres-driver-observer";

const clientPrototype = pg.Client.prototype as unknown as Record<string, unknown>;
const poolPrototype = pg.Pool.prototype as unknown as Record<string, unknown>;
const realClientQuery = clientPrototype.query;
const realPoolQuery = poolPrototype.query;
const realPoolConnect = poolPrototype.connect;

afterEach(() => {
  clientPrototype.query = realClientQuery;
  poolPrototype.query = realPoolQuery;
  poolPrototype.connect = realPoolConnect;
});

it("observe les clients empruntés, isole les opérations et restaure après une erreur", async () => {
  const fakeQuery = function fakeQuery(...args: unknown[]) {
    const callback = args.at(-1);
    if (typeof callback === "function") {
      setTimeout(() => callback(null, { rows: [{ value: "callback" }] }), 1);
      return;
    }
    return new Promise((resolve) => setTimeout(() => resolve({ rows: [{ value: "fixture" }] }), 1));
  };
  clientPrototype.query = fakeQuery;
  poolPrototype.connect = async function connect() {
    return Object.assign(Object.create(pg.Client.prototype), {
      release: () => undefined,
    }) as pg.PoolClient;
  };

  const first = measurePostgresDriverOperation(async () => {
    const pool = Object.create(pg.Pool.prototype) as pg.Pool;
    const client = await pool.connect();
    await client.query("first");
    await client.query("second");
    client.release();
  });
  const second = measurePostgresDriverOperation(async () => {
    const pool = Object.create(pg.Pool.prototype) as pg.Pool;
    const client = await pool.connect();
    await client.query("only");
    client.release();
  });

  const [firstCapture, secondCapture] = await Promise.all([first, second]);
  expect(firstCapture.metrics.queryCount).toBe(2);
  expect(firstCapture.metrics.returnedRowCount).toBe(2);
  expect(secondCapture.metrics.queryCount).toBe(1);
  expect(secondCapture.metrics.returnedRowCount).toBe(1);
  expect(firstCapture.metrics.serializedDriverResultBytes).toBeGreaterThan(0);
  expect(clientPrototype.query).toBe(fakeQuery);

  const callbackCapture = await measurePostgresDriverOperation(async () => {
    const client = Object.create(pg.Client.prototype) as pg.PoolClient;
    await new Promise<void>((resolve, reject) => {
      client.query("callback", (error) => (error ? reject(error) : resolve()));
    });
  });
  expect(callbackCapture.metrics.queryCount).toBe(1);
  expect(callbackCapture.metrics.returnedRowCount).toBe(1);

  await expect(
    measurePostgresDriverOperation(async () => {
      throw new Error("fixture failure");
    })
  ).rejects.toThrow("fixture failure");
  expect(clientPrototype.query).toBe(fakeQuery);
});
