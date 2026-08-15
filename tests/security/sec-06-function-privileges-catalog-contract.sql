\set ON_ERROR_STOP on

-- Authoritative SEC-06 assertion over the final PostgreSQL 17 catalog state.
-- Every executable non-extension routine in the application schema is in scope,
-- regardless of its name, signature, or owner.
DO $catalog_contract$
DECLARE
  application_routine_count integer;
  extension_routine_count integer;
  extension_overlap_count integer;
  public_execute_count integer;
  anon_direct_count integer;
  authenticated_direct_count integer;
  anon_effective_count integer;
  authenticated_effective_count integer;
  security_definer_count integer;
  forbidden_schema_default_count integer;
  global_default_count integer;
  global_public_default_count integer;
BEGIN
  CREATE TEMP TABLE sec06_application_routines ON COMMIT DROP AS
  SELECT
    routine.oid,
    routine.proowner,
    routine.proacl,
    routine.prokind,
    routine.prosecdef
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
    );

  SELECT count(*) INTO application_routine_count
  FROM sec06_application_routines;

  SELECT count(*) INTO extension_routine_count
  FROM pg_proc routine
  JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND routine.prokind IN ('f', 'p', 'a', 'w')
    AND EXISTS (
      SELECT 1
      FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass
        AND dependency.objid = routine.oid
        AND dependency.deptype = 'e'
    );

  SELECT count(*) INTO extension_overlap_count
  FROM sec06_application_routines application_routine
  WHERE EXISTS (
    SELECT 1
    FROM pg_depend dependency
    WHERE dependency.classid = 'pg_proc'::regclass
      AND dependency.objid = application_routine.oid
      AND dependency.deptype = 'e'
  );

  IF extension_routine_count = 0 OR extension_overlap_count > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'SEC-06 extension boundary invalid: extension_routines=%s application_overlap=%s',
      extension_routine_count,
      extension_overlap_count
    );
  END IF;

  SELECT count(*) INTO public_execute_count
  FROM sec06_application_routines application_routine
  CROSS JOIN LATERAL aclexplode(
    COALESCE(
      application_routine.proacl,
      acldefault('f', application_routine.proowner)
    )
  ) acl
  WHERE acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE';

  SELECT count(*) INTO anon_direct_count
  FROM sec06_application_routines application_routine
  CROSS JOIN LATERAL aclexplode(application_routine.proacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = 'anon'
    AND acl.privilege_type = 'EXECUTE';

  SELECT count(*) INTO authenticated_direct_count
  FROM sec06_application_routines application_routine
  CROSS JOIN LATERAL aclexplode(application_routine.proacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE grantee.rolname = 'authenticated'
    AND acl.privilege_type = 'EXECUTE';

  SELECT count(*) INTO anon_effective_count
  FROM sec06_application_routines application_routine
  WHERE has_function_privilege('anon', application_routine.oid, 'EXECUTE');

  SELECT count(*) INTO authenticated_effective_count
  FROM sec06_application_routines application_routine
  WHERE has_function_privilege('authenticated', application_routine.oid, 'EXECUTE');

  SELECT count(*) INTO security_definer_count
  FROM sec06_application_routines application_routine
  WHERE application_routine.prosecdef;

  SELECT count(*) INTO forbidden_schema_default_count
  FROM pg_default_acl defaults
  JOIN pg_roles creator ON creator.oid = defaults.defaclrole
  JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
  LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE creator.rolname = 'postgres'
    AND namespace.nspname = 'public'
    AND defaults.defaclobjtype = 'f'
    AND acl.privilege_type = 'EXECUTE'
    AND COALESCE(grantee.rolname, 'PUBLIC') IN ('PUBLIC', 'anon', 'authenticated');

  SELECT count(*) INTO global_default_count
  FROM pg_default_acl defaults
  JOIN pg_roles creator ON creator.oid = defaults.defaclrole
  WHERE creator.rolname = 'postgres'
    AND defaults.defaclobjtype = 'f'
    AND defaults.defaclnamespace = 0;

  SELECT count(*) INTO global_public_default_count
  FROM pg_default_acl defaults
  JOIN pg_roles creator ON creator.oid = defaults.defaclrole
  CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
  WHERE creator.rolname = 'postgres'
    AND defaults.defaclobjtype = 'f'
    AND defaults.defaclnamespace = 0
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE';

  IF public_execute_count > 0 OR
     anon_direct_count > 0 OR
     authenticated_direct_count > 0 OR
     anon_effective_count > 0 OR
     authenticated_effective_count > 0 OR
     security_definer_count > 0 OR
     forbidden_schema_default_count > 0 OR
     global_default_count <> 1 OR
     global_public_default_count > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'SEC-06 catalog invariant violated: routines=%s public=%s anon_direct=%s authenticated_direct=%s anon_effective=%s authenticated_effective=%s security_definer=%s schema_defaults=%s global_default_rows=%s global_public=%s',
      application_routine_count,
      public_execute_count,
      anon_direct_count,
      authenticated_direct_count,
      anon_effective_count,
      authenticated_effective_count,
      security_definer_count,
      forbidden_schema_default_count,
      global_default_count,
      global_public_default_count
    );
  END IF;
END
$catalog_contract$;

SELECT 'SEC-06 catalog invariant satisfied' AS result;
