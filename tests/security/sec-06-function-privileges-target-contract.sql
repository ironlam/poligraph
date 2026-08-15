\set ON_ERROR_STOP on

-- Candidate SEC-06 target contract. It is intentionally red against the
-- synthetic before-state. Future exceptions must be explicit rows with a
-- dedicated rationale and contract, never implicit ACL inheritance.
CREATE TEMP TABLE sec06_execute_allowlist (
  function_oid oid NOT NULL,
  grantee name NOT NULL,
  rationale text NOT NULL,
  PRIMARY KEY (function_oid, grantee)
);

CREATE TEMP TABLE sec06_definer_allowlist (
  function_oid oid PRIMARY KEY,
  expected_owner name NOT NULL,
  expected_search_path text NOT NULL,
  rationale text NOT NULL
);

-- Empty by design for the reproduced Poligraph architecture.

-- Creating the probe after all current default-privilege configuration makes
-- future-function behavior part of the same invariant.
CREATE FUNCTION public.sec06_future_target_probe()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

DO $owner_runtime$
BEGIN
  IF public.sec06_future_target_probe() <> 1 THEN
    RAISE EXCEPTION 'SEC-06 target owner execution regression';
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

-- Trigger behavior remains a server-path invariant after function ACL changes.
SET ROLE sec06_server;
DO $trigger_runtime$
DECLARE
  trigger_marker boolean;
BEGIN
  INSERT INTO public.sec06_application_trigger_fixture (content)
  VALUES ('target contract trigger path')
  RETURNING touched_by_trigger INTO trigger_marker;

  IF NOT trigger_marker THEN
    RAISE EXCEPTION 'SEC-06 target trigger regression';
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

DO $target$
DECLARE
  public_execute_count integer;
  anon_direct_count integer;
  authenticated_direct_count integer;
  anon_effective_count integer;
  authenticated_effective_count integer;
  unreviewed_definer_count integer;
  invalid_definer_contract_count integer;
  application_function_count integer;
  service_role_direct_count integer;
  service_role_effective_count integer;
  extension_function_count integer;
  public_role_default_count integer;
BEGIN
  CREATE TEMP TABLE sec06_application_functions ON COMMIT DROP AS
  SELECT p.oid, p.proowner, p.prosecdef, p.proconfig
  FROM pg_proc p
  JOIN pg_namespace namespace ON namespace.oid = p.pronamespace
  JOIN pg_roles owner_role ON owner_role.oid = p.proowner
  WHERE namespace.nspname = 'public'
    AND owner_role.rolname = 'postgres'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = p.oid
        AND dependency.deptype = 'e'
    );

  SELECT count(*) INTO application_function_count
  FROM sec06_application_functions;

  IF application_function_count <> 5 THEN
    RAISE EXCEPTION 'SEC-06 target application inventory drifted: %', application_function_count;
  END IF;

  SELECT count(*) INTO public_execute_count
  FROM sec06_application_functions function_record
  CROSS JOIN LATERAL aclexplode(
    COALESCE(
      (SELECT p.proacl FROM pg_proc p WHERE p.oid = function_record.oid),
      acldefault('f', function_record.proowner)
    )
  ) acl
  WHERE acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE'
    AND NOT EXISTS (
      SELECT 1 FROM sec06_execute_allowlist allowed
      WHERE allowed.function_oid = function_record.oid
        AND allowed.grantee = 'PUBLIC'
    );

  SELECT count(*) INTO anon_direct_count
  FROM sec06_application_functions function_record
  CROSS JOIN LATERAL aclexplode(
    COALESCE(
      (SELECT p.proacl FROM pg_proc p WHERE p.oid = function_record.oid),
      acldefault('f', function_record.proowner)
    )
  ) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = 'anon'
    AND acl.privilege_type = 'EXECUTE'
    AND NOT EXISTS (
      SELECT 1 FROM sec06_execute_allowlist allowed
      WHERE allowed.function_oid = function_record.oid
        AND allowed.grantee = 'anon'
    );

  SELECT count(*) INTO authenticated_direct_count
  FROM sec06_application_functions function_record
  CROSS JOIN LATERAL aclexplode(
    COALESCE(
      (SELECT p.proacl FROM pg_proc p WHERE p.oid = function_record.oid),
      acldefault('f', function_record.proowner)
    )
  ) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = 'authenticated'
    AND acl.privilege_type = 'EXECUTE'
    AND NOT EXISTS (
      SELECT 1 FROM sec06_execute_allowlist allowed
      WHERE allowed.function_oid = function_record.oid
        AND allowed.grantee = 'authenticated'
    );

  SELECT count(*) INTO anon_effective_count
  FROM sec06_application_functions function_record
  WHERE has_function_privilege('anon', function_record.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM sec06_execute_allowlist allowed
      WHERE allowed.function_oid = function_record.oid
        AND allowed.grantee IN ('PUBLIC', 'anon')
    );

  SELECT count(*) INTO authenticated_effective_count
  FROM sec06_application_functions function_record
  WHERE has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM sec06_execute_allowlist allowed
      WHERE allowed.function_oid = function_record.oid
        AND allowed.grantee IN ('PUBLIC', 'authenticated')
    );

  SELECT count(*) INTO unreviewed_definer_count
  FROM sec06_application_functions function_record
  WHERE function_record.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM sec06_definer_allowlist allowed
      WHERE allowed.function_oid = function_record.oid
    );

  SELECT count(*) INTO invalid_definer_contract_count
  FROM sec06_application_functions function_record
  JOIN sec06_definer_allowlist allowed ON allowed.function_oid = function_record.oid
  JOIN pg_roles owner_role ON owner_role.oid = function_record.proowner
  WHERE NOT function_record.prosecdef
     OR owner_role.rolname <> allowed.expected_owner
     OR NOT COALESCE(
       function_record.proconfig @> ARRAY['search_path=' || allowed.expected_search_path],
       false
     );

  SELECT count(*) INTO service_role_direct_count
  FROM sec06_application_functions function_record
  CROSS JOIN LATERAL aclexplode(
    COALESCE(
      (SELECT p.proacl FROM pg_proc p WHERE p.oid = function_record.oid),
      acldefault('f', function_record.proowner)
    )
  ) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = 'service_role'
    AND acl.privilege_type = 'EXECUTE';

  SELECT count(*) INTO service_role_effective_count
  FROM sec06_application_functions function_record
  WHERE has_function_privilege('service_role', function_record.oid, 'EXECUTE');

  IF service_role_direct_count <> application_function_count OR
     service_role_effective_count <> application_function_count THEN
    RAISE EXCEPTION 'SEC-06 target changed service_role function behavior';
  END IF;

  SELECT count(*) INTO public_role_default_count
  FROM pg_default_acl defaults
  JOIN pg_roles creator ON creator.oid = defaults.defaclrole
  JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE creator.rolname = 'postgres'
    AND namespace.nspname = 'public'
    AND defaults.defaclobjtype = 'f'
    AND grantee.rolname IN ('anon', 'authenticated')
    AND acl.privilege_type = 'EXECUTE';

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    JOIN pg_roles creator ON creator.oid = defaults.defaclrole
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    WHERE creator.rolname = 'postgres'
      AND defaults.defaclobjtype = 'f'
      AND defaults.defaclnamespace = 0
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 target retained the global PUBLIC function default';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    JOIN pg_roles creator ON creator.oid = defaults.defaclrole
    JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE creator.rolname = 'postgres'
      AND namespace.nspname = 'public'
      AND defaults.defaclobjtype = 'f'
      AND grantee.rolname = 'service_role'
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 target changed the service_role function default';
  END IF;

  IF NOT has_function_privilege(
    'anon', 'public.sec06_platform_managed_function()', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'public.sec06_platform_managed_function()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SEC-06 target changed the platform negative control';
  END IF;

  SELECT count(*) INTO extension_function_count
  FROM pg_proc p
  JOIN pg_namespace namespace ON namespace.oid = p.pronamespace
  WHERE namespace.nspname = 'public'
    AND EXISTS (
      SELECT 1
      FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = p.oid
        AND dependency.deptype = 'e'
    )
    AND EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    );

  IF extension_function_count = 0 THEN
    RAISE EXCEPTION 'SEC-06 target changed extension-owned function privileges';
  END IF;

  IF NOT has_schema_privilege('anon', 'public', 'USAGE') OR
     NOT has_schema_privilege('authenticated', 'public', 'USAGE') OR
     NOT has_schema_privilege('service_role', 'public', 'USAGE') OR
     NOT has_schema_privilege('sec06_server', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'SEC-06 target changed out-of-scope schema public USAGE';
  END IF;

  IF public_execute_count > 0 OR
     anon_direct_count > 0 OR
     authenticated_direct_count > 0 OR
     anon_effective_count > 0 OR
     authenticated_effective_count > 0 OR
     public_role_default_count > 0 OR
     unreviewed_definer_count > 0 OR
     invalid_definer_contract_count > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'SEC-06 target invariant violated: public=%s anon_direct=%s authenticated_direct=%s anon_effective=%s authenticated_effective=%s role_defaults=%s unreviewed_definer=%s invalid_definer_contract=%s',
      public_execute_count,
      anon_direct_count,
      authenticated_direct_count,
      anon_effective_count,
      authenticated_effective_count,
      public_role_default_count,
      unreviewed_definer_count,
      invalid_definer_contract_count
    );
  END IF;
END
$target$;

SELECT 'SEC-06 target invariant satisfied' AS result;
