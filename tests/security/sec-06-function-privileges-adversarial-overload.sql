CREATE FUNCTION public.normalize_reference(value text)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT value';

CREATE FUNCTION public.normalize_reference(value integer)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT value';

GRANT EXECUTE ON FUNCTION public.normalize_reference(integer) TO authenticated;
