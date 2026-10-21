-- Retours des visiteurs (/signaler) : table VisitorFeedback et deux énumérations.
--
-- Migration additive : une table et deux énumérations neuves, aucune colonne existante touchée.
-- NON APPLIQUÉE. À relire en entier avant application, avec une sauvegarde pg_dump :
--   npx prisma db execute --file prisma/migrations/manual/2026-10-21-visitor-feedback.sql
-- (utilise DIRECT_URL).
-- Le code tolère l'absence de la table (isMissingTableError) : il peut partir avant ce fichier,
-- le formulaire répond alors qu'il est indisponible.
--
-- Table PRIVÉE : la RLS est posée à la création par l'event trigger enable_rls_on_create, le
-- ALTER ci-dessous est redondant et sans effet si elle l'est déjà. Aucune politique n'est
-- ouverte à `anon` : un retour ne se lit que par l'admin (Prisma se connecte en `postgres`).

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('FACTUAL_ERROR', 'BUG', 'IDEA', 'OTHER');
-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'DONE', 'REJECTED');
-- CreateTable
CREATE TABLE "VisitorFeedback" (
    "id" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "pagePath" TEXT,
    "contactEmail" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "linearIssueId" TEXT,
    "linearIssueUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "VisitorFeedback_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "VisitorFeedback_status_createdAt_idx" ON "VisitorFeedback"("status", "createdAt");

ALTER TABLE "VisitorFeedback" ENABLE ROW LEVEL SECURITY;
