SET ROLE sec06_alternate_owner;
CREATE PROCEDURE public.sec06_app_adversarial_alternate_owner()
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';
RESET ROLE;
