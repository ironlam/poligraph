\set ON_ERROR_STOP on

-- Reconstruction fixture with no historical PoliGraph routines. Roles are
-- cluster-wide and were created by the before-state fixture in the first test DB.
GRANT CREATE ON SCHEMA public TO sec06_platform_owner, sec06_alternate_owner;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, sec06_server;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

SET ROLE sec06_platform_owner;
CREATE FUNCTION public.sec06_platform_managed_function()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS 'SELECT 1';
RESET ROLE;

SELECT 'SEC-06 no-history fixture ready' AS result;
