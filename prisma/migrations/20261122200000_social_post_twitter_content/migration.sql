-- X and Bluesky get different writing: the X text gets its own column, `content` keeps Bluesky's.
-- Each network also gets its own publication date (atomic claim and daily cap) and last error, so
-- two concurrent publications never overwrite each other's result.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "SocialPost"
  ADD COLUMN "twitterContent" TEXT,
  ADD COLUMN "blueskyPostedAt" TIMESTAMP(3),
  ADD COLUMN "twitterPostedAt" TIMESTAMP(3),
  ADD COLUMN "blueskyError" TEXT,
  ADD COLUMN "twitterError" TEXT;

-- Rows published by the former pipeline: their single date stands for every network they reached.
UPDATE "SocialPost" SET "blueskyPostedAt" = "postedAt" WHERE "blueskyUrl" IS NOT NULL;
UPDATE "SocialPost" SET "twitterPostedAt" = "postedAt" WHERE "twitterUrl" IS NOT NULL;

CREATE INDEX "SocialPost_blueskyPostedAt_idx" ON "SocialPost"("blueskyPostedAt");
CREATE INDEX "SocialPost_twitterPostedAt_idx" ON "SocialPost"("twitterPostedAt");

COMMIT;
