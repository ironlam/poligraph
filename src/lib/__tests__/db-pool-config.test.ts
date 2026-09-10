import { describe, expect, it, vi } from "vitest";

/**
 * `statement_timeout` in the pg.Pool config is silently ignored on this database, so declaring it
 * buys nothing and tells the next reader that queries are capped when they are not.
 *
 * Measured against production on 2026-09-10, from a session opened by this very pool:
 * `SHOW statement_timeout` returns the server default whether the option is set, whether the
 * PostgreSQL startup parameter `options=-c statement_timeout=…` is passed, or both. Only a session
 * `SET` takes effect, and a `SET` cannot be used here: the pooler hands the same physical backend
 * to unrelated clients without resetting session state, so a cap set for a page request leaks onto
 * the batch jobs that legitimately need minutes.
 *
 * See docs/engineering/db-statement-timeout.md for the measurements and for the dedicated-role
 * path that would give the request path its own cap.
 */

const capturedConfigs: Record<string, unknown>[] = [];

vi.mock("pg", () => ({
  Pool: class {
    constructor(config: Record<string, unknown>) {
      capturedConfigs.push(config);
    }
    on() {}
  },
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@/generated/prisma", () => ({
  PrismaClient: class {
    $extends() {
      return this;
    }
  },
}));
vi.mock("@/lib/public-ids/prisma-extension", () => ({
  createPoligraphIdExtension: () => () => ({}),
}));

/**
 * `db.ts` caches the client on globalThis so a lambda reuses one pool. Clearing that cache is what
 * makes the module rebuild a pool on re-import; without it only the first call captures a config
 * and every later assertion runs against an empty object, which passes for the wrong reason.
 */
async function poolConfig(): Promise<Record<string, unknown>> {
  capturedConfigs.length = 0;
  const g = globalThis as unknown as {
    prisma?: unknown;
    pool?: unknown;
    shutdownRegistered?: unknown;
  };
  delete g.prisma;
  delete g.pool;
  delete g.shutdownRegistered;
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://user@example.invalid:5432/db");
  await import("../db");
  expect(capturedConfigs, "aucun pool construit : le harnais ne mesure rien").toHaveLength(1);
  return capturedConfigs[0]!;
}

describe("configuration du pool Postgres", () => {
  it("construit bien un pool à inspecter", async () => {
    // Guards the harness: capturing nothing would make the assertions below vacuously true.
    expect(Object.keys(await poolConfig())).toContain("connectionString");
  });

  it("ne déclare pas de statement_timeout, qui serait silencieusement ignoré", async () => {
    expect(await poolConfig()).not.toHaveProperty("statement_timeout");
  });

  it("garde les réglages qui, eux, sont appliqués", async () => {
    const config = await poolConfig();
    expect(config.max).toBe(2);
    expect(config.connectionTimeoutMillis).toBe(15_000);
  });
});
