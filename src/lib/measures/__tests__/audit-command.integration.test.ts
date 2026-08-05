import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { publishSeededMeasure } from "./helpers";

// Deferred: the transitions reached through the fixtures import `@/lib/db` as a value.
let db: typeof import("@/lib/db").db;

/**
 * The exit code is what will let the command be wired into CI, so it is verified by running
 * the script, not by calling auditMeasures() again.
 */
function runAudit(): { code: number; output: string } {
  try {
    const output = execFileSync("npx", ["tsx", "scripts/audit-measures.ts"], {
      env: { ...process.env, DOTENV_CONFIG_PATH: "/dev/null" },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const AUDIT_TIMEOUT_MS = 60_000;

describeIfDisposableDb("measures:audit exit code", () => {
  // The command audits the whole database, so this file cannot tolerate the violations the
  // other files build on purpose. Truncating first makes it order-independent instead of
  // relying on "run it last", which nobody remembers six months later. Safe because the gate
  // guarantees a disposable container.
  //
  // ONE hook, and the order inside it matters. A first version of this plan truncated in one
  // beforeAll and resolved the deferred import in a second: hooks run in declaration order,
  // so the truncation reached `db` before it was assigned.
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));

    await db.searchDocument.deleteMany({});
    await db.measure.deleteMany({}); // revisions, sources, qualifications cascade
    await db.programEdition.deleteMany({});
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it(
    "exits 0 when every invariant holds",
    async () => {
      await publishSeededMeasure();

      const { code, output } = runAudit();

      expect(code).toBe(0);
      expect(output).toContain("aucun invariant violé");
    },
    AUDIT_TIMEOUT_MS
  );

  it(
    "exits 1 and names the rule when an invariant is violated",
    async () => {
      const { measureId } = await publishSeededMeasure();
      await db.measure.update({ where: { id: measureId }, data: { withdrawnAt: new Date() } });

      const { code, output } = runAudit();

      // Exiting 0 on a violation is worse than not having the command: CI would go green on
      // a database that contradicts the model.
      expect(code).toBe(1);
      expect(output).toContain("withdrawn_without_source");
    },
    AUDIT_TIMEOUT_MS
  );
});
