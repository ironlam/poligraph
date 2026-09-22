import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BATCH_CONNECTION_TIMEOUT_MS,
  WEB_CONNECTION_TIMEOUT_MS,
  DEFAULT_POOL_MAX,
} from "@/config/database";

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
  Client: class {},
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
  // In the body, a failing assertion would leave the stub behind and leak DATABASE_POOL_MAX into
  // whatever else this worker runs, turning one real failure into a cascade.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("construit bien un pool à inspecter", async () => {
    // Guards the harness: capturing nothing would make the assertions below vacuously true.
    expect(Object.keys(await poolConfig())).toContain("connectionString");
  });

  it("ne déclare pas de statement_timeout, qui serait silencieusement ignoré", async () => {
    expect(await poolConfig()).not.toHaveProperty("statement_timeout");
  });

  it("garde les réglages qui, eux, sont appliqués", async () => {
    const config = await poolConfig();
    expect(config.max).toBe(DEFAULT_POOL_MAX);
    // Le harnais tourne hors runtime Next, donc c'est le budget batch qui doit arriver ici.
    expect(config.connectionTimeoutMillis).toBe(BATCH_CONNECTION_TIMEOUT_MS);
  });

  /**
   * The pool size is the term that decides whether concurrent cold renders queue or fail, so the
   * override has to reach pg rather than stop at the config module. POLIGRAPH-V is what happens
   * when the pool is smaller than the concurrency it faces.
   */
  /**
   * Le budget qui arrive au pool suit la charge : court sous Next, généreux ailleurs. Sans cette
   * assertion, une régression sur `resolveConnectionTimeout` passerait inaperçue puisque le
   * harnais ne voit jamais le chemin web.
   */
  it("donne au runtime Next le budget court", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    expect((await poolConfig()).connectionTimeoutMillis).toBe(WEB_CONNECTION_TIMEOUT_MS);
  });

  it("fait descendre DATABASE_POOL_MAX jusqu'au pool", async () => {
    vi.stubEnv("DATABASE_POOL_MAX", "3");
    expect((await poolConfig()).max).toBe(3);
  });
});
