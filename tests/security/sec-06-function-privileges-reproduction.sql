\set ON_ERROR_STOP on

-- Synthetic SEC-06 before-state. This file is executed only in a disposable
-- PostgreSQL 17 container and does not load repository environment variables.
DO $version$
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'SEC-06 requires PostgreSQL 17, got %', current_setting('server_version');
  END IF;
END
$version$;

CREATE ROLE sec06_owner NOLOGIN;
CREATE ROLE sec06_hardened_owner NOLOGIN;
CREATE ROLE sec06_server NOLOGIN;
CREATE ROLE sec06_platform_owner NOLOGIN;
CREATE ROLE sec06_alternate_owner NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

GRANT CREATE ON SCHEMA public TO sec06_owner, sec06_hardened_owner;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, sec06_server;

-- Reproduction-only helpers live outside the application schema so the final
-- public-schema catalog contract does not need a name-based fixture exemption.
CREATE SCHEMA sec06_harness AUTHORIZATION sec06_owner;
CREATE SCHEMA sec06_platform AUTHORIZATION sec06_platform_owner;
GRANT USAGE ON SCHEMA sec06_harness, sec06_platform
  TO anon, authenticated, service_role, sec06_server;

-- A real extension-owned function in public is the negative control for the
-- catalog boundary. The separate platform schema is outside the application
-- schema and does not require a managed-object name allowlist.
CREATE EXTENSION hstore WITH SCHEMA public;

SET ROLE sec06_platform_owner;
CREATE FUNCTION sec06_platform.managed_function()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS 'SELECT 1';
RESET ROLE;

SET ROLE sec06_owner;

CREATE TABLE sec06_harness.protected_fixture (
  id integer PRIMARY KEY,
  content text NOT NULL
);
INSERT INTO sec06_harness.protected_fixture (id, content)
VALUES (1, 'synthetic protected row');

-- PostgreSQL grants PUBLIC EXECUTE when a function is created unless global
-- default privileges for the creating role override that built-in default.
CREATE FUNCTION sec06_harness.public_only()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

-- Direct grant only: PUBLIC is removed, then anon is granted explicitly.
CREATE FUNCTION sec06_harness.explicit_only()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';
REVOKE EXECUTE ON FUNCTION sec06_harness.explicit_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sec06_harness.explicit_only() TO anon;

-- Both origins are present: anon has a direct ACL entry and also inherits the
-- independent PUBLIC grant that remains on the function.
CREATE FUNCTION sec06_harness.both_origins()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';
GRANT EXECUTE ON FUNCTION sec06_harness.both_origins() TO anon;

CREATE FUNCTION sec06_harness.invoker_reads_protected()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT count(*)::integer FROM sec06_harness.protected_fixture';

-- This synthetic definer is harmless. It exists only to prove that PUBLIC
-- EXECUTE crosses a privilege boundary for a definer, unlike the invoker above.
CREATE FUNCTION sec06_harness.definer_reads_protected()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS 'SELECT count(*)::integer FROM sec06_harness.protected_fixture';

CREATE TABLE sec06_harness.trigger_fixture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content text NOT NULL,
  touched_by_trigger boolean NOT NULL DEFAULT false
);

CREATE FUNCTION sec06_harness.set_trigger_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
BEGIN
  NEW.touched_by_trigger := true;
  RETURN NEW;
END
$function$;

CREATE TRIGGER sec06_set_trigger_marker
BEFORE INSERT ON sec06_harness.trigger_fixture
FOR EACH ROW
EXECUTE FUNCTION sec06_harness.set_trigger_marker();

GRANT INSERT, SELECT ON sec06_harness.trigger_fixture TO sec06_server;
GRANT USAGE, SELECT ON SEQUENCE sec06_harness.trigger_fixture_id_seq TO sec06_server;

-- Removing direct-call permission after trigger creation does not disable the
-- trigger. The server role below has table privileges but no function EXECUTE.
REVOKE EXECUTE ON FUNCTION sec06_harness.set_trigger_marker() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sec06_harness.set_trigger_marker() FROM anon, authenticated;

-- Baseline future function with PostgreSQL's built-in global PUBLIC default.
CREATE FUNCTION sec06_harness.future_builtin_default()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

-- This is intentionally ineffective. PostgreSQL 17 per-schema defaults are
-- additive and cannot remove the built-in global PUBLIC function privilege.
ALTER DEFAULT PRIVILEGES IN SCHEMA sec06_harness
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION sec06_harness.future_after_schema_only_revoke()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

-- Representative explicit public-role defaults, separate from PUBLIC itself.
ALTER DEFAULT PRIVILEGES IN SCHEMA sec06_harness
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION sec06_harness.future_with_explicit_role_defaults()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

RESET ROLE;

-- Production inventory confirms that Poligraph application functions are
-- created by postgres. These harmless fixtures use the same identities so the
-- versioned migration is exercised without carrying production data or bodies.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION public.auto_enable_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  command record;
BEGIN
  FOR command IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE object_type = 'table'
      AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', command.object_identity);
  END LOOP;
END
$function$;

CREATE FUNCTION public.politician_search_vector_update()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE FUNCTION public.search_politicians(search_query text, result_limit integer)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT result_limit';

CREATE TABLE public.sec06_application_trigger_fixture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content text NOT NULL,
  touched_by_trigger boolean NOT NULL DEFAULT false
);

CREATE FUNCTION public.sync_vote_denorm_from_scrutin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
BEGIN
  NEW.touched_by_trigger := true;
  RETURN NEW;
END
$function$;

CREATE TRIGGER sec06_application_trigger
BEFORE INSERT ON public.sec06_application_trigger_fixture
FOR EACH ROW
EXECUTE FUNCTION public.sync_vote_denorm_from_scrutin();

GRANT INSERT, SELECT ON public.sec06_application_trigger_fixture TO sec06_server;
GRANT USAGE, SELECT ON SEQUENCE public.sec06_application_trigger_fixture_id_seq TO sec06_server;
GRANT EXECUTE ON FUNCTION public.search_politicians(text, integer) TO sec06_server;

CREATE EVENT TRIGGER sec06_application_event_trigger
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION public.auto_enable_rls();

-- Control proving the exact two-level default-privilege correction against a
-- separate synthetic owner. This does not remediate the vulnerable owner above.
ALTER DEFAULT PRIVILEGES FOR ROLE sec06_hardened_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE sec06_hardened_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE sec06_hardened_owner IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

SET ROLE sec06_hardened_owner;
CREATE FUNCTION public.sec06_hardened_future_probe()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';
RESET ROLE;

DO $contract$
DECLARE
  extension_function_count integer;
BEGIN
  -- Effective privileges inherited through PUBLIC.
  IF NOT has_function_privilege('anon', 'sec06_harness.public_only()', 'EXECUTE') OR
     NOT has_function_privilege('authenticated', 'sec06_harness.public_only()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC-06 did not reproduce effective PUBLIC EXECUTE';
  END IF;

  -- PUBLIC-only must not be confused with a direct role grant.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE p.oid = 'sec06_harness.public_only()'::regprocedure
      AND grantee.rolname IN ('anon', 'authenticated')
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 PUBLIC-only function has an unexpected direct role grant';
  END IF;

  -- Explicit-only has a direct anon grant and no effective authenticated grant.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE p.oid = 'sec06_harness.explicit_only()'::regprocedure
      AND grantee.rolname = 'anon'
      AND acl.privilege_type = 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'sec06_harness.explicit_only()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 did not distinguish an explicit-only grant';
  END IF;

  -- The combined case retains both independent ACL origins.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'sec06_harness.both_origins()'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE p.oid = 'sec06_harness.both_origins()'::regprocedure
      AND grantee.rolname = 'anon'
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 did not preserve both EXECUTE origins';
  END IF;

  -- A schema-local revoke cannot neutralize the global built-in PUBLIC default.
  IF NOT has_function_privilege(
    'public', 'sec06_harness.future_after_schema_only_revoke()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 schema-only default-privilege control is not red';
  END IF;

  -- Explicit per-schema defaults produce direct grants in addition to PUBLIC.
  IF NOT has_function_privilege(
    'public', 'sec06_harness.future_with_explicit_role_defaults()', 'EXECUTE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE p.oid = 'sec06_harness.future_with_explicit_role_defaults()'::regprocedure
      AND grantee.rolname IN ('anon', 'authenticated')
      AND acl.privilege_type = 'EXECUTE'
    GROUP BY p.oid
    HAVING count(DISTINCT grantee.rolname) = 2
  ) THEN
    RAISE EXCEPTION 'SEC-06 explicit future-role defaults were not reproduced';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    JOIN pg_roles creator ON creator.oid = defaults.defaclrole
    JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE creator.rolname = 'sec06_owner'
      AND namespace.nspname = 'sec06_harness'
      AND defaults.defaclobjtype = 'f'
      AND grantee.rolname IN ('anon', 'authenticated')
      AND acl.privilege_type = 'EXECUTE'
    GROUP BY creator.oid, namespace.oid
    HAVING count(DISTINCT grantee.rolname) = 2
  ) THEN
    RAISE EXCEPTION 'SEC-06 explicit pg_default_acl entries are missing';
  END IF;

  -- Global PUBLIC revoke plus schema-local direct-role revokes are both needed.
  IF has_function_privilege(
    'public', 'public.sec06_hardened_future_probe()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.sec06_hardened_future_probe()', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.sec06_hardened_future_probe()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 exact future default-privilege control is ineffective';
  END IF;

  IF NOT has_function_privilege(
    'sec06_hardened_owner', 'public.sec06_hardened_future_probe()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'public.sec06_hardened_future_probe()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 exact defaults changed owner or service_role behavior';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    JOIN pg_roles creator ON creator.oid = defaults.defaclrole
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE creator.rolname = 'sec06_hardened_owner'
      AND defaults.defaclobjtype = 'f'
      AND acl.privilege_type = 'EXECUTE'
      AND COALESCE(grantee.rolname, 'PUBLIC') IN ('PUBLIC', 'anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'SEC-06 hardened defaults retain a forbidden grantee';
  END IF;

  SELECT count(*) INTO extension_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND EXISTS (
      SELECT 1
      FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = p.oid
        AND dependency.deptype = 'e'
    );

  IF extension_function_count = 0 THEN
    RAISE EXCEPTION 'SEC-06 extension negative control is missing';
  END IF;

  IF NOT has_schema_privilege('anon', 'public', 'USAGE') OR
     NOT has_schema_privilege('authenticated', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'SEC-06 changed schema public USAGE';
  END IF;
END
$contract$;

-- EXECUTE is effective, but SECURITY INVOKER still uses the caller's table
-- privileges and therefore cannot cross the SEC-03 boundary.
SET ROLE anon;
DO $invoker$
BEGIN
  BEGIN
    PERFORM * FROM sec06_harness.protected_fixture;
    RAISE EXCEPTION 'SEC-06 direct table access unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM sec06_harness.invoker_reads_protected();
    RAISE EXCEPTION 'SEC-06 SECURITY INVOKER bypassed table privileges';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF sec06_harness.definer_reads_protected() <> 1 THEN
    RAISE EXCEPTION 'SEC-06 harmless SECURITY DEFINER control returned an invalid result';
  END IF;
END
$invoker$;
RESET ROLE;

-- Trigger firing is distinct from direct invocation permission. This role has
-- DML privileges on the table and no EXECUTE on the trigger function.
DO $trigger_privilege$
BEGIN
  IF has_function_privilege(
    'sec06_server', 'sec06_harness.set_trigger_marker()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 trigger control retained direct EXECUTE';
  END IF;
END
$trigger_privilege$;

SET ROLE sec06_server;
DO $trigger_runtime$
DECLARE
  trigger_marker boolean;
BEGIN
  INSERT INTO sec06_harness.trigger_fixture (content)
  VALUES ('server trigger path')
  RETURNING touched_by_trigger INTO trigger_marker;

  IF NOT trigger_marker THEN
    RAISE EXCEPTION 'SEC-06 trigger stopped after EXECUTE revocation';
  END IF;
END
$trigger_runtime$;
RESET ROLE;

SET ROLE sec06_owner;
DO $owner_path$
BEGIN
  IF sec06_harness.invoker_reads_protected() <> 1 THEN
    RAISE EXCEPTION 'SEC-06 owner path could not execute the invoker function';
  END IF;
END
$owner_path$;
RESET ROLE;

SELECT 'SEC-06 isolated vulnerable behavior reproduced' AS result;
