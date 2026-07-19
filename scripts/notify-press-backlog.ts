/**
 * Press backlog notifier (daily sync step).
 *
 * Counts press articles still awaiting AI analysis (aiAnalyzedAt = null). When the
 * backlog crosses a threshold, emails a catch-up nudge so the analysis can be
 * replayed manually from a Claude Code CLI session (`/analyse-presse`) without
 * spending API credits. De-duplicated to at most once per ~day via syncMetadata.
 *
 * Non-blocking in the orchestrator (allowFailure): a mail hiccup must never fail
 * the whole daily sync.
 *
 * Usage:
 *   npx tsx scripts/notify-press-backlog.ts
 *   npx tsx scripts/notify-press-backlog.ts --dry-run   # count only, no email
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { syncMetadata } from "../src/lib/sync/sync-metadata";
import { sendTransactional } from "../src/lib/email/mailjet";
import {
  PRESS_BACKLOG_THRESHOLD_DEFAULT,
  buildPressBacklogEmail,
  shouldNotifyPressBacklog,
} from "../src/lib/email/press-backlog";

const DRY_RUN = process.argv.includes("--dry-run");

const NOTIFY_KEY = "press-backlog-notify";
// At most one nudge per ~day (the sync runs 3x/day).
const NOTIFY_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;
// Only recent articles matter: the pipeline prioritizes fresh news, so a fresh
// backlog means it fell behind. The deep all-time backlog (~13k old Tier-2
// articles) is a separate drain project (#338) and would otherwise page daily.
const BACKLOG_WINDOW_DAYS = 3;

function getThreshold(): number {
  const raw = Number(process.env.PRESS_BACKLOG_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : PRESS_BACKLOG_THRESHOLD_DEFAULT;
}

async function main() {
  const threshold = getThreshold();
  const recipient = process.env.PRESS_BACKLOG_NOTIFY_EMAIL || "lamine@poligraph.fr";

  const cutoff = new Date(Date.now() - BACKLOG_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const backlog = await db.pressArticle.count({
    where: { aiAnalyzedAt: null, publishedAt: { gte: cutoff } },
  });
  console.log(
    `Press backlog (last ${BACKLOG_WINDOW_DAYS}d): ${backlog} unanalyzed article(s) (threshold ${threshold})`
  );

  if (!shouldNotifyPressBacklog(backlog, threshold)) {
    console.log("Backlog under threshold, no notification.");
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Would email ${recipient} about ${backlog} article(s).`);
    return;
  }

  if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
    console.warn("MAILJET_API_KEY / MAILJET_SECRET_KEY not set, skipping notification.");
    return;
  }

  // De-duplicate: skip if we already notified within the last ~day.
  if (!(await syncMetadata.shouldSync(NOTIFY_KEY, NOTIFY_MIN_INTERVAL_MS))) {
    console.log("Already notified recently, skipping.");
    return;
  }

  const { subject, html, text } = buildPressBacklogEmail(backlog, BACKLOG_WINDOW_DAYS);
  await sendTransactional({ to: recipient, subject, html, text });
  await syncMetadata.markCompleted(NOTIFY_KEY, { itemCount: backlog });
  console.log(`Notification sent to ${recipient}.`);
}

main().catch((err) => {
  console.error("Press backlog notification failed:", err);
  process.exit(1);
});
