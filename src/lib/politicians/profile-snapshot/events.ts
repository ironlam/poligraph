/**
 * Event names and sending for the profile-snapshot jobs. No database access here on purpose:
 * routes that only send events (the cron revalidation) must not reach Prisma models through it.
 */

export const PROFILE_REFRESH_EVENT = "politician/profile.refresh";
export const PROFILE_RECONCILE_EVENT = "politician/profile.reconcile";
export const PROFILE_INVALIDATION_CAP = 2000;

export type InngestEventPayload = { name: string; data: Record<string, unknown> };
export type Send = (events: InngestEventPayload[]) => Promise<unknown>;

export async function defaultSend(events: InngestEventPayload[]): Promise<unknown> {
  // Lazy import: loading this module must not construct the Inngest client.
  const { inngest } = await import("@/inngest/client");
  return inngest.send(events);
}

/**
 * Whether the automatic triggers (end of sync-daily, cron revalidation, scrutin sync) may ask for
 * a reconcile pass. Off unless `PROFILE_SNAPSHOT_AUTO_RECONCILE` is exactly `"true"`: the first
 * fill is a measured manual run, not whatever sync happens to follow the deploy. A manual event
 * from the Inngest dashboard and the moderation fallback do not consult it.
 */
export function isProfileAutoReconcileEnabled(): boolean {
  return process.env.PROFILE_SNAPSHOT_AUTO_RECONCILE === "true";
}

/**
 * Asks for one reconcile pass over every public profile, after a write too wide to target (a
 * sync, a cron revalidation). Never throws: the write that asked for it is already committed,
 * and the next reconcile covers a lost request.
 */
export async function requestProfileReconcile(
  reason: string,
  send: Send = defaultSend
): Promise<{ sent: number }> {
  try {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.info(JSON.stringify({ event: "[profile-snapshot] reconcile request", reason }));
    await send([{ name: PROFILE_RECONCILE_EVENT, data: { reason } }]);
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
