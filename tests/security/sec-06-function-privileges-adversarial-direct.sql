CREATE FUNCTION public.sec06_app_adversarial_direct()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

GRANT EXECUTE ON FUNCTION public.sec06_app_adversarial_direct() TO anon;
