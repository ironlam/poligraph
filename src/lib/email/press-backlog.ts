/**
 * Content and threshold logic for the "press backlog to analyze" notification.
 *
 * Kept free of any Mailjet / DB import so it can be unit-tested in isolation and
 * reused by the daily-sync notifier step (scripts/notify-press-backlog.ts).
 */

/** Default number of unanalyzed articles above which we email a catch-up nudge. */
export const PRESS_BACKLOG_THRESHOLD_DEFAULT = 30;

/** Whether the current backlog warrants a catch-up email. */
export function shouldNotifyPressBacklog(backlog: number, threshold: number): boolean {
  return backlog >= threshold;
}

/** Build the transactional email body for a press-analysis backlog nudge. */
export function buildPressBacklogEmail(
  backlog: number,
  windowDays: number
): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Poligraph : ${backlog} articles de presse récents à analyser`;

  const catchUpCommand = "npm run sync:press-analysis -- --limit=100";

  const text = [
    `${backlog} articles de presse publiés ces ${windowDays} derniers jours`,
    `attendent une analyse.`,
    ``,
    `L'analyse automatique du daily sync a décroché (crédit API, lenteur upstream`,
    `ou volume d'articles).`,
    ``,
    `Pour rattraper quand tu veux, ouvre une session Claude Code CLI et lance :`,
    ``,
    `    ${catchUpCommand}`,
  ].join("\n");

  const html = `<!-- press backlog nudge -->
<div style="font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.5; color: #1a1a1a;">
  <p><strong>${backlog} articles de presse</strong> publiés ces ${windowDays} derniers
  jours attendent une analyse.</p>
  <p>L'analyse automatique du daily sync a décroché (crédit API, lenteur upstream
  ou volume d'articles).</p>
  <p>Pour rattraper quand tu veux, ouvre une session Claude Code CLI et lance :</p>
  <p><code style="background:#f2f2f2;padding:4px 8px;border-radius:4px;">${catchUpCommand}</code></p>
</div>`;

  return { subject, html, text };
}
