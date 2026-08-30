CREATE SCHEMA IF NOT EXISTS extensions;

-- Older local databases installed vector in public through docker/init.sql. CREATE EXTENSION IF
-- NOT EXISTS does not move an existing extension, so normalize its schema before referencing the
-- qualified type. Moving the extension preserves dependent columns because PostgreSQL tracks them
-- by object identifier.
DO $$
DECLARE
  installed_schema TEXT;
BEGIN
  SELECT namespace.nspname
  INTO installed_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'vector';

  IF installed_schema IS NULL THEN
    CREATE EXTENSION vector WITH SCHEMA extensions;
  ELSIF installed_schema <> 'extensions' THEN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
  END IF;
END
$$;

CREATE TABLE "SearchEmbedding" (
  "id" TEXT NOT NULL,
  "searchDocumentId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "embedding" extensions.vector(1024) NOT NULL,
  "embeddedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SearchEmbedding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SearchEmbedding_searchDocumentId_fkey"
    FOREIGN KEY ("searchDocumentId") REFERENCES "SearchDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SearchEmbedding_searchDocumentId_key"
  ON "SearchEmbedding"("searchDocumentId");
CREATE INDEX "SearchEmbedding_model_sourceUpdatedAt_idx"
  ON "SearchEmbedding"("model", "sourceUpdatedAt");
CREATE INDEX "SearchEmbedding_embedding_hnsw_idx"
  ON "SearchEmbedding" USING hnsw ("embedding" extensions.vector_cosine_ops);

ALTER TABLE "SearchEmbedding" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "SearchEmbedding" IS
  'Derived semantic index. No direct anon policy: public access goes through server-side search with SearchDocument visibility checks.';
