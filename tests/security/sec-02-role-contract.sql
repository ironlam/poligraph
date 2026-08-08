\set ON_ERROR_STOP on

CREATE ROLE sec02_public NOLOGIN;
CREATE ROLE sec02_server NOLOGIN BYPASSRLS;

CREATE SCHEMA sec02_private;
CREATE TABLE sec02_private.editorial_fixture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publication_state text NOT NULL CHECK (publication_state IN ('PUBLISHED', 'DRAFT')),
  content text NOT NULL
);

ALTER TABLE sec02_private.editorial_fixture ENABLE ROW LEVEL SECURITY;

INSERT INTO sec02_private.editorial_fixture (publication_state, content)
VALUES
  ('PUBLISHED', 'synthetic published row'),
  ('DRAFT', 'synthetic unpublished row');

GRANT USAGE ON SCHEMA sec02_private TO sec02_server;
GRANT SELECT ON sec02_private.editorial_fixture TO sec02_server;

-- The removed alternate path has no privilege to reach the application schema.
SET ROLE sec02_public;
DO $$
BEGIN
  BEGIN
    EXECUTE 'SELECT count(*) FROM sec02_private.editorial_fixture';
    RAISE EXCEPTION 'SEC-02 invariant violated: the public role reached editorial data';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

-- The application server keeps its direct PostgreSQL access and can read both
-- synthetic states. Disabling an HTTP data surface must not disable the database.
SET ROLE sec02_server;
DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM sec02_private.editorial_fixture;
  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'SEC-02 server-path regression: expected 2 rows, got %', visible_count;
  END IF;
END
$$;
RESET ROLE;
