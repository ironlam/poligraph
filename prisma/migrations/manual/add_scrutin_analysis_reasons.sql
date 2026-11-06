-- Raisons du pour et du contre d'une analyse de débat, structurées (public).
-- Additif et nullable : le code actuel l'ignore, l'appliquer AVANT le déploiement du code qui le lit.
ALTER TABLE "ScrutinAnalysis" ADD COLUMN IF NOT EXISTS "reasons" JSONB;
