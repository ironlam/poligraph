ALTER TABLE "Scrutin" ADD COLUMN "officialSeanceRef" TEXT;
ALTER TABLE "DebateTranscript" ADD COLUMN "paragraphs" JSONB,
ADD COLUMN "sourceHash" TEXT, ADD COLUMN "parserVersion" INTEGER;
ALTER TABLE "ScrutinAnalysis" ADD COLUMN "evidence" JSONB,
ADD COLUMN "sourceUrl" TEXT, ADD COLUMN "commonDiscussion" BOOLEAN NOT NULL DEFAULT false;
