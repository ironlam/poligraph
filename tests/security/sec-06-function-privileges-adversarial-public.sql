CREATE FUNCTION public.calculate_visibility_score()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

GRANT EXECUTE ON FUNCTION public.calculate_visibility_score() TO PUBLIC;
