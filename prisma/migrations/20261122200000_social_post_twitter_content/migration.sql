-- X and Bluesky get different writing: the X text gets its own column, `content` keeps Bluesky's.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "SocialPost" ADD COLUMN "twitterContent" TEXT;

COMMIT;
