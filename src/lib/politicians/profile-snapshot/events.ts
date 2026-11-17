/**
 * Event names and sending for the profile-snapshot jobs. No database access here on purpose:
 * routes that only send events (the cron revalidation) must not reach Prisma models through it.
 *
 * The automatic triggers (end of sync-daily, cron revalidation, scrutin sync, votes revalidation)
 * always send: deploy in off-peak hours and run the first reconcile by hand right after, so the
 * initial fill is measured rather than left to whatever sync follows the deploy.
 */

import { relayProfileEvents, resolveProfileRelayTarget } from "./relay";

export const PROFILE_REFRESH_EVENT = "politician/profile.refresh";
export const PROFILE_RECONCILE_EVENT = "politician/profile.reconcile";
// Its own event rather than a field of the one above: both are debounced, the last event of a
// window wins, and a narrow request must never replace a full one.
export const PROFILE_RECONCILE_ACTIVE_EVENT = "politician/profile.reconcile-active";
export const PROFILE_INVALIDATION_CAP = 2000;

export type InngestEventPayload = { name: string; data: Record<string, unknown> };
export type Send = (events: InngestEventPayload[]) => Promise<unknown>;

export async function inngestSend(events: InngestEventPayload[]): Promise<unknown> {
  // Lazy import: loading this module must not construct the Inngest client.
  const { inngest } = await import("@/inngest/client");
  return inngest.send(events);
}

/**
 * Inngest directly, or through the application when the caller has no event key (a GitHub Actions
 * workflow, see ./relay.ts). The relay route itself sends with `inngestSend`, never with this.
 */
export async function defaultSend(events: InngestEventPayload[]): Promise<unknown> {
  const target = resolveProfileRelayTarget();
  if (target) return relayProfileEvents(events, target);
  return inngestSend(events);
}

/**
 * Asks for one reconcile pass over every public profile, after a write too wide to target (the
 * `politicians` purge, a moderation whose targets could not be resolved). Never throws: the write
 * that asked for it is already committed, and the next reconcile covers a lost request.
 */
export async function requestProfileReconcile(
  reason: string,
  send: Send = defaultSend
): Promise<{ sent: number }> {
  return sendReconcile(PROFILE_RECONCILE_EVENT, reason, send);
}

/**
 * Asks for the pass limited to the profiles a vote or fact-check sync can change
 * (`listActiveProfilePoliticianIds`). Never throws, for the same reason.
 */
export async function requestActiveProfileReconcile(
  reason: string,
  send: Send = defaultSend
): Promise<{ sent: number }> {
  return sendReconcile(PROFILE_RECONCILE_ACTIVE_EVENT, reason, send);
}

async function sendReconcile(name: string, reason: string, send: Send): Promise<{ sent: number }> {
  try {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.info(JSON.stringify({ event: "[profile-snapshot] reconcile request", reason }));
    await send([{ name, data: { reason } }]);
    return { sent: 1 };
  } catch (error) {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.warn(
      JSON.stringify({
        event: "[profile-snapshot] reconcile request failed",
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return { sent: 0 };
  }
}
