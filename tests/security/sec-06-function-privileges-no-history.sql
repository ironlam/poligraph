\set ON_ERROR_STOP on

-- Reconstruction fixture with no historical PoliGraph routines. Roles are
-- cluster-wide and were created by the before-state fixture in the first test DB.
GRANT CREATE ON SCHEMA public TO sec06_alternate_owner;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, sec06_server;

CREATE SCHEMA sec06_platform AUTHORIZATION sec06_platform_owner;
GRANT USAGE ON SCHEMA sec06_platform TO anon, authenticated;

-- Real extension membership, rather than naming or ownership, defines the
-- managed-object exclusion used by the authoritative catalog contract.
CREATE EXTENSION hstore WITH SCHEMA public;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

SET ROLE sec06_platform_owner;
CREATE FUNCTION sec06_platform.managed_function()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS 'SELECT 1';
RESET ROLE;

SELECT 'SEC-06 no-history fixture ready' AS result;
