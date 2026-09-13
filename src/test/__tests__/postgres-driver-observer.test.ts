import pg from "pg";
import { afterEach, expect, it } from "vitest";
import { measurePostgresDriverOperation } from "../postgres-driver-observer";

const prototype = pg.Pool.prototype as unknown as Record<string, unknown>;
const realQuery = prototype.query;

afterEach(() => {
  prototype.query = realQuery;
});

it("isole les opérations concurrentes et restaure le driver après une erreur", async () => {
  const fakeQuery = function fakeQuery() {
    return new Promise((resolve) => setTimeout(() => resolve({ rows: [{ value: "fixture" }] }), 1));
  };
  prototype.query = fakeQuery;

  const first = measurePostgresDriverOperation(async () => {
    const client = Object.create(pg.Pool.prototype) as pg.Pool;
    await client.query("first");
    await client.query("second");
  });
  const second = measurePostgresDriverOperation(async () => {
    const client = Object.create(pg.Pool.prototype) as pg.Pool;
    await client.query("only");
  });

  const [firstCapture, secondCapture] = await Promise.all([first, second]);
  expect(firstCapture.metrics.queryCount).toBe(2);
  expect(firstCapture.metrics.returnedRowCount).toBe(2);
  expect(secondCapture.metrics.queryCount).toBe(1);
  expect(secondCapture.metrics.returnedRowCount).toBe(1);
  expect(firstCapture.metrics.serializedDriverResultBytes).toBeGreaterThan(0);
  expect(prototype.query).toBe(fakeQuery);

  await expect(
    measurePostgresDriverOperation(async () => {
      throw new Error("fixture failure");
    })
  ).rejects.toThrow("fixture failure");
  expect(prototype.query).toBe(fakeQuery);
});
