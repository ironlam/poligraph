import { refreshPoliticianProfile, type RefreshOutcome } from "./refresh";
import { requestProfileReconcile } from "./events";
import { requestProfileRefresh, resolveProfileTargets, type ProfileRefreshTarget } from "./request";

/**
 * Above this many profiles a moderation request stops recomputing everything inline: only the
 * profiles that lose an affair stay synchronous, the rest go through Inngest. Keeps a bulk
 * moderation request bounded.
 */
export const MODERATION_SYNC_LIMIT = 50;

export type ModerationRefreshTarget = Exclude<ProfileRefreshTarget, { partyId: string }>;

/**
 * Recomputes, inside the moderation request, the profile documents touched by a publication
 * change, so an unpublished affair or fact-check leaves the profile before the admin gets the
 * response. Sequential on purpose: one pool connection at a time.
 *
 * Never throws: the moderation write is committed, failing the request would only hide that.
 * A failed recompute is logged and requested again through Inngest; a failed target resolution
 * asks for a reconcile pass.
 *
 * Bulk moderation: when more than MODERATION_SYNC_LIMIT profiles are touched, only
 * `privacyCriticalPoliticianIds` are recomputed inline (the profiles that showed an affair which
 * is no longer published; the caller resolves them before its write, while the rows still
 * exist); every other profile is sent to Inngest.
 */
export async function refreshProfilesForModeration(
  target: ModerationRefreshTarget,
  reason: string,
  options: { privacyCriticalPoliticianIds?: string[] } = {}
): Promise<RefreshOutcome[]> {
  let inline: string[];
  try {
    const politicianIds = await resolveProfileTargets(target);
    inline = politicianIds;
    if (politicianIds.length > MODERATION_SYNC_LIMIT) {
      const critical = new Set(options.privacyCriticalPoliticianIds ?? []);
      inline = [...critical];
      await requestProfileRefresh(
        { politicianIds: politicianIds.filter((id) => !critical.has(id)) },
        reason
      );
    }
  } catch (error) {
    logFailure("[profile-snapshot] moderation resolve failed", { reason }, error);
    // The write is committed: without targets, only a full pass removes an unpublished item.
    await requestProfileReconcile(`moderation-fallback:${reason}`);
    return [];
  }

  const outcomes: RefreshOutcome[] = [];
  const failed: string[] = [];
  for (const politicianId of inline) {
    try {
      outcomes.push(await refreshPoliticianProfile(politicianId, reason));
    } catch (error) {
      logFailure("[profile-snapshot] moderation refresh failed", { politicianId, reason }, error);
      failed.push(politicianId);
    }
  }
  if (failed.length > 0) await requestProfileRefresh({ politicianIds: failed }, reason);
  return outcomes;
}

function logFailure(event: string, fields: Record<string, string>, error: unknown): void {
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
  console.error(
    JSON.stringify({
      event,
      ...fields,
      error: error instanceof Error ? error.message : String(error),
    })
  );
}
