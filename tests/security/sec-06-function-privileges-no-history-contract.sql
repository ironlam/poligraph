\set ON_ERROR_STOP on

CREATE FUNCTION public.sec06_app_future_no_history()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE PROCEDURE public.sec06_app_future_no_history_procedure()
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

CREATE AGGREGATE public.sec06_app_future_no_history_sum(integer) (
  SFUNC = int4pl,
  STYPE = integer,
  INITCOND = '0'
);

DO $scope_contract$
DECLARE
  routine_oid oid;
BEGIN
  IF public.sec06_app_future_no_history() <> 1 THEN
    RAISE EXCEPTION 'SEC-06 no-history owner function path failed';
  END IF;

  CALL public.sec06_app_future_no_history_procedure();

  IF (SELECT public.sec06_app_future_no_history_sum(value) FROM (VALUES (1), (2)) values(value)) <> 3 THEN
    RAISE EXCEPTION 'SEC-06 no-history aggregate path failed';
  END IF;

  FOR routine_oid IN
    SELECT routine.oid
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname LIKE 'sec06_app_%'
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
    'anon', 'public.sec06_platform_managed_function()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'public.sec06_platform_managed_function()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 no-history migration changed the platform negative control';
  END IF;
END
$scope_contract$;

\ir sec-06-function-privileges-catalog-contract.sql

SELECT 'SEC-06 no-history target invariant satisfied' AS result;
