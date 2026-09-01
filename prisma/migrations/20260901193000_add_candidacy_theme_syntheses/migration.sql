CREATE TYPE "CandidacyThemeSynthesisStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED');

CREATE TABLE "CandidacyThemeSynthesis" (
    "id" TEXT NOT NULL,
    "candidacyPresidentialId" TEXT NOT NULL,
    "theme" "ThemeCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "corpusFingerprint" TEXT NOT NULL,
    "sourceMeasureCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "CandidacyThemeSynthesisStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidacyThemeSynthesis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidacyThemeSynthesis_candidacyPresidentialId_theme_key"
    ON "CandidacyThemeSynthesis"("candidacyPresidentialId", "theme");
CREATE INDEX "CandidacyThemeSynthesis_candidacyPresidentialId_status_idx"
    ON "CandidacyThemeSynthesis"("candidacyPresidentialId", "status");
CREATE INDEX "CandidacyThemeSynthesis_status_updatedAt_idx"
    ON "CandidacyThemeSynthesis"("status", "updatedAt");

ALTER TABLE "CandidacyThemeSynthesis"
    ADD CONSTRAINT "CandidacyThemeSynthesis_candidacyPresidentialId_fkey"
    FOREIGN KEY ("candidacyPresidentialId") REFERENCES "CandidacyPresidential"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidacyThemeSynthesis" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_published_candidacy_theme_syntheses"
    ON "CandidacyThemeSynthesis" FOR SELECT TO anon
    USING ("status" = 'PUBLISHED');
