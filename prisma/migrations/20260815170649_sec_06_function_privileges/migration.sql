-- SEC-06: application functions are internal to the direct PostgreSQL server path.
-- Keep schema, table, sequence, RLS, service_role, and managed-function ACLs unchanged.
-- Historical manual migrations are not guaranteed to exist in every reconstructed
-- environment. Resolve each exact overload before applying its bounded revoke.
DO $sec06$
DECLARE
  routine_signature text;
  routine_oid regprocedure;
  resolved_signature text;
BEGIN
  FOREACH routine_signature IN ARRAY ARRAY[
    'public.auto_enable_rls()',
    'public.politician_search_vector_update()',
    'public.search_politicians(text,integer)',
    'public.sync_vote_denorm_from_scrutin()'
  ]
  LOOP
    routine_oid := to_regprocedure(routine_signature);

    IF routine_oid IS NOT NULL THEN
      SELECT format(
        '%I.%I(%s)',
        namespace.nspname,
        routine.proname,
        pg_get_function_identity_arguments(routine.oid)
      )
      INTO resolved_signature
      FROM pg_proc routine
      JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
      WHERE routine.oid = routine_oid;

      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        resolved_signature
      );
    END IF;
  END LOOP;
END
$sec06$;

-- PostgreSQL's built-in function default is global. A schema-qualified revoke
-- cannot remove it, so PUBLIC must be changed at the creator-role level.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Supabase's explicit public-schema defaults are independent of PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- These fail-closed defaults also apply to future extensions installed or
-- upgraded by postgres. Review their resulting ACLs and grant only what each
-- extension actually requires.
