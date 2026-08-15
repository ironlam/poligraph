CREATE FUNCTION public.calculate_source_rank()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT 1';

GRANT EXECUTE ON FUNCTION public.calculate_source_rank() TO authenticated;
