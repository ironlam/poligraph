CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE "Measure" ADD COLUMN "slug" TEXT;
ALTER TABLE "MeasureRevision" ADD COLUMN "details" TEXT;

WITH raw_rows AS (
  SELECT
    m.id,
    TRIM(BOTH '-' FROM REGEXP_REPLACE(
      LOWER(UNACCENT(CONCAT_WS('-', p.slug, COALESCE(published.text, latest.text, 'mesure')))),
      '[^a-z0-9]+',
      '-',
      'g'
    )) AS raw_slug
  FROM "Measure" m
  JOIN "Politician" p ON p.id = m."politicianId"
  LEFT JOIN "MeasureRevision" published ON published.id = m."publishedRevisionId"
  LEFT JOIN "MeasureRevision" latest ON latest.id = m."latestRevisionId"
), source_rows AS (
  SELECT
    id,
    CASE
      WHEN LENGTH(raw_slug) <= 140 THEN raw_slug
      ELSE REGEXP_REPLACE(LEFT(raw_slug, 140), '-[^-]*$', '')
    END AS base_slug
  FROM raw_rows
), normalized AS (
  SELECT
    id,
    CASE
      WHEN RIGHT(base_slug, 1) = '-' THEN RTRIM(base_slug, '-')
      WHEN base_slug = '' THEN 'mesure'
      ELSE base_slug
    END AS base_slug
  FROM source_rows
), ranked AS (
  SELECT
    id,
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS ordinal
  FROM normalized
)
UPDATE "Measure" m
SET "slug" = CASE
  WHEN ranked.ordinal = 1 THEN ranked.base_slug
  -- The normalized base can never contain "--". Reserve that separator and append the unique
  -- measure id so a generated duplicate cannot collide with a natural slug or another prefix.
  ELSE LEFT(
    ranked.base_slug,
    140 - LENGTH(ranked.id) - 2
  ) || '--' || ranked.id
END
FROM ranked
WHERE ranked.id = m.id;

ALTER TABLE "Measure" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Measure_slug_key" ON "Measure"("slug");
