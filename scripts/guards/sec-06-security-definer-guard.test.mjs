import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

import {
  findRoutinePrivilegeViolations,
  listApplicationSqlFiles,
} from "./sec-06-security-definer-guard.mjs";

const migrationPath = path.resolve("prisma/migrations/20990101000000_fixture/migration.sql");

function violationsFor(sql) {
  return findRoutinePrivilegeViolations([[migrationPath, sql]]);
}

describe("SEC-06 routine privilege source guard", () => {
  test("rejects explicit SECURITY DEFINER boundaries, including executable blocks", () => {
    const sql = `
      CREATE FUNCTION public.first_fixture() RETURNS integer
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      ALTER PROCEDURE public.second_fixture(text) SECURITY DEFINER;
      DO $$ BEGIN
        EXECUTE 'ALTER FUNCTION public.third_fixture() SECURITY DEFINER';
      END $$;
    `;

    assert.equal(violationsFor(sql).filter(({ kind }) => kind === "security-definer").length, 1);
  });

  test("rejects direct routine EXECUTE and ALL grants to public roles", () => {
    const forbidden = [
      "GRANT EXECUTE ON FUNCTION public.fixture() TO PUBLIC;",
      "GRANT EXECUTE ON FUNCTION public.fixture(text), public.fixture(integer) TO anon;",
      'GRANT ALL PRIVILEGES ON PROCEDURE public.fixture() TO "authenticated";',
      "GRANT EXECUTE ON ROUTINE public.fixture() TO service_role, anon;",
      "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;",
      "GRANT ALL ON ALL ROUTINES IN SCHEMA public TO PUBLIC;",
    ];

    for (const sql of forbidden) {
      assert.ok(
        violationsFor(sql).some(({ kind }) => kind === "routine-execute-grant"),
        sql
      );
    }
  });

  test("rejects permissive routine default grants to public roles", () => {
    const forbidden = [
      "ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;",
      "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon;",
      "ALTER DEFAULT PRIVILEGES FOR USER postgres GRANT ALL PRIVILEGES ON PROCEDURES TO authenticated;",
    ];

    for (const sql of forbidden) {
      assert.ok(
        violationsFor(sql).some(({ kind }) => kind === "routine-default-grant"),
        sql
      );
    }
  });

  test("accepts invokers, revokes, non-public grants, and comments", () => {
    const sql = `
      -- CREATE FUNCTION public.documented() SECURITY DEFINER;
      /* GRANT EXECUTE ON FUNCTION public.documented() TO PUBLIC; */
      CREATE FUNCTION public.safe_fixture() RETURNS integer
      LANGUAGE sql SECURITY INVOKER AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON ROUTINE public.safe_fixture() FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.safe_fixture() TO sec06_server, service_role;
      ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    `;

    assert.deepEqual(violationsFor(sql), []);
  });

  test("rejects arbitrarily concatenated dynamic DDL in future migrations", () => {
    const sql = `
      DO $$ BEGIN
        EXECUTE 'ALTER FUNCTION public.fixture() SECURITY ' || 'DEFINER';
      END $$;
    `;

    assert.ok(violationsFor(sql).some(({ kind }) => kind === "unbounded-dynamic-sql"));
    assert.ok(violationsFor(sql).some(({ kind }) => kind === "unbounded-do-block"));
  });

  test("allows only the bounded dynamic SQL already reviewed in SEC-06", () => {
    const sql = `
      DO $sec06$
      BEGIN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
          resolved_signature
        );
      END
      $sec06$;
    `;
    const currentMigrationPath = path.resolve(
      "prisma/migrations/20260815170649_sec_06_function_privileges/migration.sql"
    );

    assert.deepEqual(findRoutinePrivilegeViolations([[currentMigrationPath, sql]]), []);
  });

  test("covers standard and operational manual SQL migration paths", () => {
    const relativeFiles = listApplicationSqlFiles().map((file) =>
      path.relative(process.cwd(), file)
    );

    assert.ok(
      relativeFiles.includes(
        "prisma/migrations/20260815170649_sec_06_function_privileges/migration.sql"
      )
    );
    assert.ok(
      relativeFiles.includes("prisma/migrations/manual/2026-04-08-vote-denorm-trigger.sql")
    );
  });
});
