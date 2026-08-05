import { describe, expect, it } from "vitest";
import { isSearchTestDb } from "./helpers";

/**
 * Unit test, no database: this is the gate that decides whether the destructive suites of
 * the lot run at all, so it must be covered by CI, which has no database.
 */
describe("isSearchTestDb", () => {
  it("accepts the disposable search container", () => {
    expect(
      isSearchTestDb(
        "postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable"
      )
    ).toBe(true);
  });

  it("refuses another local database on another port", () => {
    // The whole reason this gate exists. `describeIfLocalDb` says yes to this URL, and
    // the suite would run ALTER TABLE and db:push --accept-data-loss against it.
    expect(isSearchTestDb("postgresql://user:pass@localhost:5432/poligraph_dev")).toBe(false);
  });

  it("refuses the #477 harness, which is a different container", () => {
    expect(isSearchTestDb("postgresql://poligraph_test@localhost:55432/poligraph_test")).toBe(
      false
    );
  });

  it("refuses another database name on the right port", () => {
    expect(isSearchTestDb("postgresql://poligraph_test@localhost:55433/poligraph")).toBe(false);
  });

  it("refuses a remote host", () => {
    expect(
      isSearchTestDb("postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:55433/poligraph_test")
    ).toBe(false);
  });

  it("refuses a local tunnel that forwards to somewhere else", () => {
    // Same shape as the throwaway container but a port nobody would use for it. The gate
    // cannot see through a tunnel, which is exactly why it pins the port and the name.
    expect(isSearchTestDb("postgresql://u:p@localhost:6543/poligraph_test")).toBe(false);
  });

  it("is not fooled by the expected values appearing in credentials", () => {
    expect(
      isSearchTestDb("postgresql://localhost:55433:poligraph_test@db.example.com:5432/prod")
    ).toBe(false);
  });

  it("refuses an unparseable URL", () => {
    expect(isSearchTestDb("")).toBe(false);
    expect(isSearchTestDb("not a url")).toBe(false);
    expect(isSearchTestDb("localhost:55433/poligraph_test")).toBe(false); // no scheme
  });

  it("refuses an unset DATABASE_URL", () => {
    // Deliberately NOT written as isSearchTestDb(undefined): the default parameter would
    // then read process.env anyway, so the assertion passed with no database and failed
    // under the harness. The variable has to actually be removed.
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(isSearchTestDb()).toBe(false);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
