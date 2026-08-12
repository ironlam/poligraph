import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { containsForbiddenPublicGrant } from "./sec-03-public-grants-guard.mjs";

describe("SEC-03 public grants guard", () => {
  const forbidden = [
    "GRANT SELECT ON TABLE public.fixture TO anon;",
    "GRANT ALL ON TABLE public.fixture TO authenticated;",
    "GRANT SELECT ON TABLE public.fixture TO PUBLIC;",
    "GRANT USAGE ON SEQUENCE public.fixture_id_seq TO anon;",
    "GRANT UPDATE ON SEQUENCE public.fixture_id_seq TO authenticated;",
    "GRANT ALL ON SEQUENCE public.fixture_id_seq TO PUBLIC;",
    "GRANT SELECT ON TABLE public.fixture TO service_role, PUBLIC, auditor;",
    "gRaNt ALL ON ALL TABLES IN SCHEMA public\n  To authenticated;",
    "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public\nTO service_role, public;",
  ];

  for (const sql of forbidden) {
    test(`rejects ${JSON.stringify(sql)}`, () => {
      assert.equal(containsForbiddenPublicGrant(sql), true);
    });
  }

  const allowed = [
    "REVOKE ALL ON TABLE public.fixture FROM PUBLIC;",
    "REVOKE ALL ON SEQUENCE public.fixture_id_seq FROM anon;",
    "GRANT ALL ON TABLE public.fixture TO service_role;",
    "GRANT EXECUTE ON FUNCTION public.fixture() TO PUBLIC;",
    "GRANT USAGE ON SCHEMA public TO anon;",
    "CREATE TABLE public.fixture (id bigint);",
    "-- GRANT SELECT ON TABLE public.fixture TO PUBLIC;",
    "/* GRANT USAGE ON SEQUENCE public.fixture_id_seq TO authenticated; */",
  ];

  for (const sql of allowed) {
    test(`accepts ${JSON.stringify(sql)}`, () => {
      assert.equal(containsForbiddenPublicGrant(sql), false);
    });
  }
});
