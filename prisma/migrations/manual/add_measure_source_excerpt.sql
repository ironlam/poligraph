-- Passage verbatim d'une source écrite, affiché sur la page de la mesure.
-- Colonne nullable : aucune ligne existante ni aucune page ne change tant qu'elle est vide.
ALTER TABLE "MeasureSource" ADD COLUMN IF NOT EXISTS "excerpt" TEXT;
