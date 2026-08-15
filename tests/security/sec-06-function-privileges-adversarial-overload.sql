CREATE FUNCTION public.sec06_app_adversarial_overload(value text)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT value';

CREATE FUNCTION public.sec06_app_adversarial_overload(value integer)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT value';

GRANT EXECUTE ON FUNCTION public.sec06_app_adversarial_overload(integer) TO authenticated;
