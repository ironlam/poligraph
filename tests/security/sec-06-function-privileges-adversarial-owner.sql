SET ROLE sec06_alternate_owner;
CREATE PROCEDURE public.refresh_materialized_summary()
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';
RESET ROLE;
