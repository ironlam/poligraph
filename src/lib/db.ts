import { PrismaClient } from "@/generated/prisma";
import { PRISMA_TRANSACTION_OPTIONS } from "@/config/database";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createPoligraphIdExtension } from "@/lib/public-ids/prisma-extension";

type ExtendedPrismaClient = ReturnType<typeof buildExtendedClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
  pool: Pool | undefined;
  shutdownRegistered: boolean | undefined;
};

function buildExtendedClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Create a connection pool (SSL required by Supabase, rejectUnauthorized: false for pooler certs)
  // Serverless-friendly: small pool per lambda, but enough to handle parallel queries within a request
  //
  // SSL: on by default (production/staging on Supabase are unchanged). Set
  // DATABASE_SSL=false ONLY for a local, non-TLS Postgres such as the disposable
  // Docker test database. The variable must be the exact string "false" to disable.
  const useSsl = process.env.DATABASE_SSL !== "false";
  const pool = new Pool({
    connectionString,
    max: 2, // Serverless: each Vercel lambda gets its own pool — keep low to avoid exhausting Supabase pooler
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    allowExitOnIdle: true, // Release idle connections faster in serverless
    statement_timeout: 30_000, // Kill queries after 30s to prevent pool starvation
  });
  globalForPrisma.pool = pool;

  // Create the Prisma adapter
  const adapter = new PrismaPg(pool);

  // Create the raw Prisma client (used both directly and as the base for
  // the publicId extension, which needs a non-extended client to avoid
  // recursive query hooks when allocating sequence values).
  const rawClient = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: PRISMA_TRANSACTION_OPTIONS,
  });

  return rawClient.$extends(createPoligraphIdExtension(rawClient));
}

export const db = globalForPrisma.prisma ?? buildExtendedClient();

/**
 * The client handed to a `db.$transaction(async (tx) => …)` callback.
 *
 * Derived from `db` rather than written as `Prisma.TransactionClient`: this client
 * is extended, so its transaction client is not assignable to the vanilla type.
 * Exported so a service can hand its transaction to another service and keep one
 * atomic unit across module boundaries.
 */
export type DbTransactionClient = Omit<
  typeof db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// Cache in all environments — prevents duplicate pools in serverless (Vercel)
// and avoids hot-reload duplication in dev
globalForPrisma.prisma = db;

// Graceful shutdown - only register once to avoid memory leak
if (!globalForPrisma.shutdownRegistered) {
  globalForPrisma.shutdownRegistered = true;
  process.on("beforeExit", async () => {
    const pool = globalForPrisma.pool;
    if (pool) {
      globalForPrisma.pool = undefined;
      await pool.end();
    }
  });
}
