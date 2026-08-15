\set ON_ERROR_STOP on

-- Create function, procedure, and aggregate probes after the migration. The
-- catalog contract below covers every pg_proc routine kind in the marked scope.
CREATE FUNCTION public.sec06_app_future_target_probe()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE PROCEDURE public.sec06_app_future_target_procedure()
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE AGGREGATE public.sec06_app_future_target_sum(integer) (
  SFUNC = int4pl,
  STYPE = integer,
  INITCOND = '0'
);

DO $owner_runtime$
BEGIN
  IF public.sec06_app_future_target_probe() <> 1 THEN
    RAISE EXCEPTION 'SEC-06 target owner function execution regression';
  END IF;

  CALL public.sec06_app_future_target_procedure();

  IF (SELECT public.sec06_app_future_target_sum(value) FROM (VALUES (1), (2)) values(value)) <> 3 THEN
    RAISE EXCEPTION 'SEC-06 target owner aggregate execution regression';
  END IF;
END
$owner_runtime$;

-- The direct application server path is independent of public Data API roles.
SET ROLE sec06_server;
DO $server_runtime$
BEGIN
  IF public.search_politicians('synthetic', 1) <> 1 THEN
    RAISE EXCEPTION 'SEC-06 target server execution regression';
  END IF;
END
$server_runtime$;
RESET ROLE;

-- Row triggers run independently of direct function EXECUTE grants.
SET ROLE sec06_server;
DO $trigger_runtime$
DECLARE
  trigger_marker boolean;
BEGIN
  INSERT INTO public.sec06_application_trigger_fixture (content)
  VALUES ('target contract trigger path')
  RETURNING touched_by_trigger INTO trigger_marker;

  IF NOT trigger_marker THEN
    RAISE EXCEPTION 'SEC-06 target row-trigger regression';
  END IF;
END
$trigger_runtime$;
RESET ROLE;

-- Event triggers also run independently of direct function EXECUTE grants.
CREATE TABLE public.sec06_event_trigger_probe (id integer PRIMARY KEY);

DO $event_trigger_runtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'sec06_event_trigger_probe'
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'SEC-06 target event-trigger regression';
  END IF;
END
$event_trigger_runtime$;

DO $scope_contract$
DECLARE
  application_routine record;
  extension_function_count integer;
BEGIN
  FOR application_routine IN
    SELECT routine.oid, routine.proacl
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND (
        routine.proname LIKE 'sec06_app_%'
        OR routine.oid = ANY (
          ARRAY[
            to_regprocedure('public.auto_enable_rls()')::oid,
            to_regprocedure('public.politician_search_vector_update()')::oid,
            to_regprocedure('public.search_politicians(text,integer)')::oid,
            to_regprocedure('public.sync_vote_denorm_from_scrutin()')::oid
          ]::oid[]
        )
      )
  LOOP
    IF NOT has_function_privilege('service_role', application_routine.oid, 'EXECUTE') OR
       NOT EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(application_routine.proacl, '{}'::aclitem[])) acl
         JOIN pg_roles grantee ON grantee.oid = acl.grantee
         WHERE grantee.rolname = 'service_role'
           AND acl.privilege_type = 'EXECUTE'
       ) THEN
      RAISE EXCEPTION 'SEC-06 target changed service_role routine behavior';
    END IF;
  END LOOP;

  IF NOT has_schema_privilege('anon', 'public', 'USAGE') OR
     NOT has_schema_privilege('authenticated', 'public', 'USAGE') OR
     NOT has_schema_privilege('service_role', 'public', 'USAGE') OR
     NOT has_schema_privilege('sec06_server', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'SEC-06 target changed out-of-scope schema public USAGE';
  END IF;

  IF NOT has_function_privilege(
    'anon', 'public.sec06_platform_managed_function()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'public.sec06_platform_managed_function()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 target changed the platform negative control';
  END IF;

  SELECT count(*) INTO extension_function_count
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND EXISTS (
      SELECT 1
      FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = routine.oid
        AND dependency.deptype = 'e'
    )
    AND EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    );

  IF extension_function_count = 0 THEN
    RAISE EXCEPTION 'SEC-06 target changed extension-owned function privileges';
  END IF;
END
$scope_contract$;

\ir sec-06-function-privileges-catalog-contract.sql

SELECT 'SEC-06 target invariant satisfied' AS result;
