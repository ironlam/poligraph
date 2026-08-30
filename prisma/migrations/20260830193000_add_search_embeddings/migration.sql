CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

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
