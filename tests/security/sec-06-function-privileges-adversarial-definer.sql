DO $dynamic_ddl$
BEGIN
  EXECUTE
    'CREATE FUNCTION public.build_publication_snapshot() ' ||
    'RETURNS integer LANGUAGE sql SECURITY ' ||
    'DEFINER AS ''SELECT 1''';
END
$dynamic_ddl$;
