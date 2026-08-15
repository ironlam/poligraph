\set ON_ERROR_STOP on

-- One exact historical identity exercises replay when only part of the manual
-- migration history is present. The migration must not create the other three.
CREATE FUNCTION public.search_politicians(search_query text, result_limit integer)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
AS 'SELECT result_limit';

SELECT 'SEC-06 partial-history fixture ready' AS result;
