-- Retours des visiteurs : retrait des colonnes prévues pour Linear, finalement non utilisé.
--
-- Suite de 2026-10-21-visitor-feedback.sql. Les deux colonnes n'ont jamais été écrites : la
-- table était vide et le code qui les lisait n'a jamais été déployé.
-- NON APPLIQUÉE. À relire avant application :
--   npx prisma db execute --file prisma/migrations/manual/2026-10-21-visitor-feedback-drop-linear.sql
-- (utilise DIRECT_URL).

ALTER TABLE "VisitorFeedback" DROP COLUMN IF EXISTS "linearIssueId";
ALTER TABLE "VisitorFeedback" DROP COLUMN IF EXISTS "linearIssueUrl";
