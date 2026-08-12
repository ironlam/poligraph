\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE sec03_server NOLOGIN BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, sec03_server;

CREATE TABLE public.sec03_existing_fixture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content text NOT NULL
);
CREATE SEQUENCE public.sec03_existing_sequence;
CREATE TABLE public.sec03_public_risk_fixture (content text NOT NULL);
CREATE SEQUENCE public.sec03_public_risk_sequence;

ALTER TABLE public.sec03_existing_fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY sec03_synthetic_read_policy
  ON public.sec03_existing_fixture
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE FUNCTION public.sec03_synthetic_function()
RETURNS integer
LANGUAGE sql
AS 'SELECT 1';

GRANT ALL PRIVILEGES ON TABLE public.sec03_existing_fixture TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.sec03_existing_fixture_id_seq
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.sec03_existing_sequence
  TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sec03_public_risk_fixture TO PUBLIC;
GRANT USAGE ON SEQUENCE public.sec03_public_risk_sequence TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sec03_synthetic_function() TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.sec03_existing_fixture TO sec03_server;
GRANT ALL PRIVILEGES ON SEQUENCE public.sec03_existing_fixture_id_seq TO sec03_server;
GRANT ALL PRIVILEGES ON SEQUENCE public.sec03_existing_sequence TO sec03_server;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role;

-- PUBLIC grants are effective for every role. Production inventory found no such
-- application grants, so normalize this synthetic risk before applying the
-- unchanged SEC-03 migration and retain it as a regression scenario for the guard.
DO $$
BEGIN
  IF NOT has_table_privilege('anon', 'public.sec03_public_risk_fixture', 'SELECT') OR
     NOT has_table_privilege('authenticated', 'public.sec03_public_risk_fixture', 'SELECT') OR
     NOT has_sequence_privilege('anon', 'public.sec03_public_risk_sequence', 'USAGE') OR
     NOT has_sequence_privilege('authenticated', 'public.sec03_public_risk_sequence', 'USAGE') THEN
    RAISE EXCEPTION 'SEC-03 synthetic PUBLIC grant did not produce effective privileges';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE public.sec03_public_risk_fixture FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE public.sec03_public_risk_sequence FROM PUBLIC;

\i /sec03-migration.sql

CREATE TABLE public.sec03_future_fixture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content text NOT NULL
);
CREATE SEQUENCE public.sec03_future_sequence;

DO $$
DECLARE
  public_role name;
  table_privilege text;
  sequence_privilege text;
BEGIN
  FOREACH public_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name]
  LOOP
    FOREACH table_privilege IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]
    LOOP
      IF has_table_privilege(public_role, 'public.sec03_existing_fixture', table_privilege) THEN
        RAISE EXCEPTION 'SEC-03 existing-table privilege remained for %: %',
          public_role, table_privilege;
      END IF;
      IF has_table_privilege(public_role, 'public.sec03_future_fixture', table_privilege) THEN
        RAISE EXCEPTION 'SEC-03 future-table privilege appeared for %: %',
          public_role, table_privilege;
      END IF;
      IF has_table_privilege(public_role, 'public.sec03_public_risk_fixture', table_privilege) THEN
        RAISE EXCEPTION 'SEC-03 PUBLIC table privilege remained effective for %: %',
          public_role, table_privilege;
      END IF;
    END LOOP;

    FOREACH sequence_privilege IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE']
    LOOP
      IF has_sequence_privilege(
        public_role,
        'public.sec03_existing_sequence',
        sequence_privilege
      ) THEN
        RAISE EXCEPTION 'SEC-03 existing-sequence privilege remained for %: %',
          public_role, sequence_privilege;
      END IF;
      IF has_sequence_privilege(
        public_role,
        'public.sec03_public_risk_sequence',
        sequence_privilege
      ) THEN
        RAISE EXCEPTION 'SEC-03 PUBLIC sequence privilege remained effective for %: %',
          public_role, sequence_privilege;
      END IF;
      IF has_sequence_privilege(
        public_role,
        'public.sec03_future_sequence',
        sequence_privilege
      ) THEN
        RAISE EXCEPTION 'SEC-03 future-sequence privilege appeared for %: %',
          public_role, sequence_privilege;
      END IF;
      IF has_sequence_privilege(
        public_role,
        'public.sec03_future_fixture_id_seq',
        sequence_privilege
      ) THEN
        RAISE EXCEPTION 'SEC-03 future identity-sequence privilege appeared for %: %',
          public_role, sequence_privilege;
      END IF;
    END LOOP;

    IF NOT has_schema_privilege(public_role, 'public', 'USAGE') THEN
      RAISE EXCEPTION 'SEC-03 changed schema USAGE for %', public_role;
    END IF;
    IF NOT has_function_privilege(public_role, 'public.sec03_synthetic_function()', 'EXECUTE') THEN
      RAISE EXCEPTION 'SEC-03 changed function EXECUTE for %', public_role;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sec03_existing_fixture'
      AND policyname = 'sec03_synthetic_read_policy'
  ) THEN
    RAISE EXCEPTION 'SEC-03 removed a synthetic RLS policy';
  END IF;

  IF NOT has_table_privilege(
    'service_role',
    'public.sec03_existing_fixture',
    'SELECT,INSERT,UPDATE,DELETE'
  ) OR NOT has_table_privilege(
    'service_role',
    'public.sec03_future_fixture',
    'SELECT,INSERT,UPDATE,DELETE'
  ) THEN
    RAISE EXCEPTION 'SEC-03 changed service_role table privileges';
  END IF;

  IF NOT has_sequence_privilege(
    'service_role',
    'public.sec03_existing_sequence',
    'USAGE,SELECT,UPDATE'
  ) OR NOT has_sequence_privilege(
    'service_role',
    'public.sec03_future_sequence',
    'USAGE,SELECT,UPDATE'
  ) THEN
    RAISE EXCEPTION 'SEC-03 changed service_role sequence privileges';
  END IF;
END
$$;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.sec03_existing_fixture;
    RAISE EXCEPTION 'SEC-03 read invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.sec03_existing_fixture (content) VALUES ('synthetic');
    RAISE EXCEPTION 'SEC-03 insert invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.sec03_existing_fixture SET content = 'synthetic';
    RAISE EXCEPTION 'SEC-03 update invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.sec03_existing_fixture;
    RAISE EXCEPTION 'SEC-03 delete invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM nextval('public.sec03_existing_sequence');
    RAISE EXCEPTION 'SEC-03 sequence invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.sec03_existing_fixture;
    RAISE EXCEPTION 'SEC-03 authenticated read invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.sec03_existing_fixture (content) VALUES ('synthetic');
    RAISE EXCEPTION 'SEC-03 authenticated write invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM nextval('public.sec03_existing_sequence');
    RAISE EXCEPTION 'SEC-03 authenticated sequence invariant violated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

SET ROLE sec03_server;
INSERT INTO public.sec03_existing_fixture (content) VALUES ('server path preserved');
UPDATE public.sec03_existing_fixture SET content = 'server path remains direct';
SELECT nextval('public.sec03_existing_sequence');
DELETE FROM public.sec03_existing_fixture;
RESET ROLE;
