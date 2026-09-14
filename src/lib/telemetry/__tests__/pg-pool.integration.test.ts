// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { measurePostgresDriverOperation } from "@/test/postgres-driver-observer";
import { ObservedPool } from "../pg-pool";
import { observeRead } from "../read-operations";

describeIfDisposableDb("read telemetry on PostgreSQL 17", () => {
  let pool: ObservedPool;
  let prisma: PrismaClient;
  const events: Array<Record<string, unknown>> = [];
  beforeAll(() => {
    assertDisposableTestDb();
    vi.stubEnv("DB_READ_TELEMETRY", "true");
    vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
    vi.stubEnv("DB_READ_MAX_EVENTS", "10000");
    vi.spyOn(console, "info").mockImplementation((line: string) => events.push(JSON.parse(line)));
    pool = new ObservedPool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 1 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("attributes queued concurrent pool queries against the #881 oracle", async () => {
    events.length = 0;
    const measured = await measurePostgresDriverOperation(() =>
      Promise.all([
        observeRead("presidential.hub.load", () =>
          pool.query("SELECT pg_sleep(0.02), generate_series(1, 3)")
        ),
        observeRead("presidential.themes.load", () => pool.query("SELECT generate_series(1, 7)")),
      ])
    );
    expect(measured.result.map((result) => result.rows.length)).toEqual([3, 7]);
    expect(events.find((e) => e.operation === "presidential.hub.load")).toMatchObject({
      driverCalls: 1,
      driverRows: 3,
    });
    expect(events.find((e) => e.operation === "presidential.themes.load")).toMatchObject({
      driverCalls: 1,
      driverRows: 7,
    });
    expect(events.reduce((sum, e) => sum + Number(e.driverCalls), 0)).toBe(
      measured.metrics.queryCount
    );
    expect(events.reduce((sum, e) => sum + Number(e.driverRows), 0)).toBe(
      measured.metrics.returnedRowCount
    );
  });

  it("preserves Prisma transactions, raw reads, nested attribution and rollback errors", async () => {
    events.length = 0;
    const measured = await measurePostgresDriverOperation(() =>
      observeRead("presidential.hub.load", () =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT generate_series(1, 2)`);
          return observeRead("presidential.themes.load", () =>
            tx.$queryRaw(Prisma.sql`SELECT generate_series(1, 5)`)
          );
        })
      )
    );
    expect(measured.result).toHaveLength(5);
    expect(events.find((e) => e.operation === "presidential.themes.load")).toMatchObject({
      driverCalls: 1,
      driverRows: 5,
    });
    expect(events.reduce((sum, e) => sum + Number(e.driverCalls), 0)).toBe(
      measured.metrics.queryCount
    );
    expect(events.reduce((sum, e) => sum + Number(e.driverRows), 0)).toBe(
      measured.metrics.returnedRowCount
    );
    const error = new Error("private transaction error");
    await expect(
      observeRead("presidential.hub.load", () =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT 1`);
          throw error;
        })
      )
    ).rejects.toBe(error);
    expect(events.at(-1)?.success).toBe(false);
    expect(await prisma.$queryRaw(Prisma.sql`SELECT 42 AS answer`)).toEqual([{ answer: 42 }]);
    expect(JSON.stringify(events)).not.toContain("private transaction error");
  });

  it("keeps unsampled queued work outside a sampled operation", async () => {
    events.length = 0;
    const sampled = observeRead("presidential.hub.load", () => pool.query("SELECT pg_sleep(0.02)"));
    vi.stubEnv("DB_READ_SAMPLE_RATE", "0");
    await Promise.all([
      sampled,
      observeRead("presidential.themes.load", () => pool.query("SELECT generate_series(1, 99)")),
    ]);
    vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ driverCalls: 1, driverRows: 1 });
  });

  it("attributes concurrent lazy Prisma reads and array transactions", async () => {
    events.length = 0;
    await Promise.all([
      observeRead("presidential.hub.load", () =>
        prisma.$queryRaw(Prisma.sql`SELECT pg_sleep(0.02)::text, generate_series(1, 3)`)
      ),
      observeRead("presidential.themes.load", () =>
        prisma.$queryRaw(Prisma.sql`SELECT generate_series(1, 7)`)
      ),
    ]);
    expect(events.find((e) => e.operation === "presidential.hub.load")).toMatchObject({
      driverCalls: 1,
      driverRows: 3,
    });
    expect(events.find((e) => e.operation === "presidential.themes.load")).toMatchObject({
      driverCalls: 1,
      driverRows: 7,
    });
    events.length = 0;
    const oracle = await measurePostgresDriverOperation(() =>
      observeRead("presidential.hub.load", () =>
        prisma.$transaction([
          prisma.$queryRaw(Prisma.sql`SELECT generate_series(1, 2)`),
          prisma.$queryRaw(Prisma.sql`SELECT generate_series(1, 3)`),
        ])
      )
    );
    expect(events[0]).toMatchObject({
      driverCalls: oracle.metrics.queryCount,
      driverRows: oracle.metrics.returnedRowCount,
    });
  });

  it("counts driver result rows, not affected rows or server statements", async () => {
    events.length = 0;
    await observeRead("presidential.hub.load", async () => {
      const client = await pool.connect();
      try {
        await client.query(
          "CREATE TEMP TABLE telemetry_fixture AS SELECT generate_series(1, 4) AS n"
        );
        await client.query("UPDATE telemetry_fixture SET n = n + 1");
        await client.query("SELECT n FROM telemetry_fixture; SELECT 1 AS n");
        await client.query("DROP TABLE telemetry_fixture");
      } finally {
        client.release();
      }
    });
    expect(events[0]).toMatchObject({
      driverCalls: 4,
      driverRows: 5,
      serverStatements: null,
      prismaObjects: null,
    });
  });

  it("supports callbacks, explicit pool connections and unchanged driver errors", async () => {
    events.length = 0;
    await observeRead(
      "elections.details.load",
      () =>
        new Promise<void>((resolve, reject) => {
          pool.connect((error, client, release) => {
            if (error || !client) return reject(error);
            client.query("SELECT 42 AS answer", function (this: unknown, queryError, result) {
              release();
              if (queryError) return reject(queryError);
              expect(this).toHaveProperty("text", "SELECT 42 AS answer");
              expect(result.rows).toEqual([{ answer: 42 }]);
              resolve();
            });
          });
        })
    );
    expect(events[0]).toMatchObject({ driverCalls: 1, driverRows: 1 });
    await expect(
      observeRead("elections.details.load", () => pool.query("SELECT 1/0"))
    ).rejects.toMatchObject({ code: "22012" });
    expect(events.at(-1)).toMatchObject({ driverFailed: 1, driverRows: 0, success: false });
  });

  it("reports synthetic overhead without timing assertions or additional SQL", async () => {
    const reports = [];
    // Warm both Prisma and pg before measuring. The oracle's serialization is outside timing runs.
    await pool.query("SELECT generate_series(1, 100)");
    for (const enabled of [false, true, false, true]) {
      vi.stubEnv("DB_READ_TELEMETRY", String(enabled));
      events.length = 0;
      const heapBefore = process.memoryUsage().heapUsed;
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        await observeRead("measures.election.full", () =>
          pool.query("SELECT generate_series(1, 100)")
        );
      }
      const durationMs = performance.now() - start;
      const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
      const logBytes = events.reduce(
        (sum, event) => sum + Buffer.byteLength(JSON.stringify(event)) + 1,
        0
      );
      const oracle = await measurePostgresDriverOperation(() =>
        observeRead("measures.election.full", () => pool.query("SELECT generate_series(1, 100)"))
      );
      expect(oracle.metrics.queryCount).toBe(1);
      expect(oracle.metrics.returnedRowCount).toBe(100);
      reports.push({
        enabled,
        iterations: 100,
        durationMs,
        heapDeltaBytes,
        logBytes,
        queryCountPerOperation: oracle.metrics.queryCount,
      });
    }
    vi.stubEnv("DB_READ_TELEMETRY", "true");
    console.log(JSON.stringify({ benchmark: "read-telemetry", reports }));
  });
});
