\set ON_ERROR_STOP on

CREATE FUNCTION public.calculate_reconstruction_total()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE PROCEDURE public.refresh_reconstruction_cache()
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE AGGREGATE public.reconstruction_integer_sum(integer) (
  SFUNC = int4pl,
  STYPE = integer,
  INITCOND = '0'
);

DO $scope_contract$
DECLARE
  routine_oid oid;
BEGIN
  IF public.calculate_reconstruction_total() <> 1 THEN
    RAISE EXCEPTION 'SEC-06 no-history owner function path failed';
  END IF;

  CALL public.refresh_reconstruction_cache();

  IF (SELECT public.reconstruction_integer_sum(value) FROM (VALUES (1), (2)) values(value)) <> 3 THEN
    RAISE EXCEPTION 'SEC-06 no-history aggregate path failed';
  END IF;

  FOR routine_oid IN
    SELECT routine.oid
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.prokind IN ('f', 'p', 'a', 'w')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = routine.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    IF NOT has_function_privilege('service_role', routine_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'SEC-06 no-history migration changed service_role behavior';
    END IF;
  END LOOP;

  IF NOT has_schema_privilege('anon', 'public', 'USAGE') OR
     NOT has_schema_privilege('authenticated', 'public', 'USAGE') OR
     NOT has_schema_privilege('service_role', 'public', 'USAGE') OR
     NOT has_schema_privilege('sec06_server', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'SEC-06 no-history migration changed schema public USAGE';
  END IF;

  IF NOT has_function_privilege(
    'anon', 'sec06_platform.managed_function()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'sec06_platform.managed_function()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 no-history migration changed the platform negative control';
  END IF;
END
$scope_contract$;

\ir sec-06-function-privileges-catalog-contract.sql

SELECT 'SEC-06 no-history target invariant satisfied' AS result;
