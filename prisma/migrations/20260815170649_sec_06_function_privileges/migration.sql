-- SEC-06: application functions are internal to the direct PostgreSQL server path.
-- Keep schema, table, sequence, RLS, service_role, and managed-function ACLs unchanged.
REVOKE EXECUTE ON FUNCTION public.auto_enable_rls() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.politician_search_vector_update()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_politicians(text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_vote_denorm_from_scrutin()
  FROM PUBLIC, anon, authenticated;

-- PostgreSQL's built-in function default is global. A schema-qualified revoke
-- cannot remove it, so PUBLIC must be changed at the creator-role level.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Supabase's explicit public-schema defaults are independent of PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
