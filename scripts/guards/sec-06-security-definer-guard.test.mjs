import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

import { findSecurityDefinerViolations } from "./sec-06-security-definer-guard.mjs";

const migrationPath = path.resolve("prisma/migrations/20990101000000_fixture/migration.sql");

describe("SEC-06 SECURITY DEFINER guard", () => {
  test("rejects CREATE and ALTER privilege boundaries by default", () => {
    const sql = `
      CREATE FUNCTION public.first_fixture() RETURNS integer
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      ALTER FUNCTION public.second_fixture(text) SECURITY DEFINER;
    `;

    const violations = findSecurityDefinerViolations([[migrationPath, sql]], new Map());

    assert.deepEqual(
      violations.map(({ signature }) => signature),
      ["public.first_fixture()", "public.second_fixture(text)"]
    );
  });

  test("accepts invokers and ignores comments and function bodies", () => {
    const sql = `
      -- SECURITY DEFINER is documentation here.
      CREATE FUNCTION public.safe_fixture() RETURNS text
      LANGUAGE sql SECURITY INVOKER AS $$ SELECT 'SECURITY DEFINER' $$;
      /* ALTER FUNCTION public.safe_fixture() SECURITY DEFINER; */
    `;

    assert.deepEqual(findSecurityDefinerViolations([[migrationPath, sql]], new Map()), []);
  });

  test("requires a complete, exact allowlist contract", () => {
    const sql = `
      CREATE FUNCTION public.reviewed_fixture() RETURNS integer
      LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$;
    `;
    const key = "prisma/migrations/20990101000000_fixture/migration.sql::public.reviewed_fixture()";
    const completeAllowlist = new Map([
      [
        key,
        {
          owner: "restricted_owner",
          searchPath: "",
          justification: "Synthetic guard contract",
          executeGrantees: [],
          contractTest: "tests/security/reviewed-fixture-contract.sql",
        },
      ],
    ]);

    assert.deepEqual(findSecurityDefinerViolations([[migrationPath, sql]], completeAllowlist), []);

    const incompleteAllowlist = new Map([[key, { owner: "restricted_owner" }]]);
    assert.ok(
      findSecurityDefinerViolations([[migrationPath, sql]], incompleteAllowlist).length > 0
    );
  });

  test("rejects unsafe search paths and stale allowlist entries", () => {
    const key = "prisma/migrations/20990101000000_fixture/migration.sql::public.missing_fixture()";
    const unsafeAllowlist = new Map([
      [
        key,
        {
          owner: "restricted_owner",
          searchPath: "public, pg_temp",
          justification: "Synthetic unsafe contract",
          executeGrantees: ["authenticated"],
          contractTest: "tests/security/missing-fixture-contract.sql",
        },
      ],
    ]);

    const unsafeViolations = findSecurityDefinerViolations(
      [[migrationPath, "SELECT 1;"]],
      unsafeAllowlist
    );
    assert.ok(unsafeViolations.some(({ reason }) => reason === "incomplete contract"));

    const staleAllowlist = new Map([
      [
        key,
        {
          owner: "restricted_owner",
          searchPath: "",
          justification: "Synthetic stale contract",
          executeGrantees: [],
          contractTest: "tests/security/missing-fixture-contract.sql",
        },
      ],
    ]);
    const staleViolations = findSecurityDefinerViolations(
      [[migrationPath, "SELECT 1;"]],
      staleAllowlist
    );
    assert.ok(staleViolations.some(({ reason }) => reason === "stale allowlist entry"));
  });
});
