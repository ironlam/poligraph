DO $dynamic_ddl$
BEGIN
  EXECUTE
    'CREATE FUNCTION public.sec06_app_adversarial_dynamic_definer() ' ||
    'RETURNS integer LANGUAGE sql SECURITY ' ||
    'DEFINER AS ''SELECT 1''';
END
$dynamic_ddl$;
