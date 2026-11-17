/**
 * Decides whether profile-snapshot events go through the application, and in what shape, when the
 * caller has no Inngest event key: a GitHub Actions workflow. The key lives in the application
 * only, so a script running there got a 401 and its refresh request was lost until the next daily
 * purge of `politicians` (#1355).
 *
 * No network call here: the HTTP transport is src/lib/api/profile-relay.ts. No import from
 * ./events and no database access either: ./events loads this module.
 */

// Kept in step with ./events by relay.test.ts.
const REFRESH = "politician/profile.refresh";
const RECONCILE = "politician/profile.reconcile";
const RECONCILE_ACTIVE = "politician/profile.reconcile-active";

type RelayEvent = { name: string; data: Record<string, unknown> };
type RelayEnv = Readonly<Record<string, string | undefined>>;

export type ProfileRelayBody =
  | { profileRefresh: { politicianIds: string[]; reason: string } }
  | { profileReconcile: { reason: string; active: boolean } };

export interface ProfileRelayTarget {
  endpoint: string;
  secret: string;
}

/**
 * Where to relay, or null when the caller should talk to Inngest itself: it has an event key, or
 * it lacks what the relay needs.
 */
export function resolveProfileRelayTarget(env: RelayEnv = process.env): ProfileRelayTarget | null {
  if (env.INNGEST_EVENT_KEY?.trim()) return null;
  const secret = env.CRON_SECRET?.trim();
  const baseUrl = env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!secret || !baseUrl) return null;
  const origin = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  return { endpoint: `${origin.replace(/\/$/, "")}/api/cron/revalidate`, secret };
}

/** One request body per batch of events. Throws on an event the route would not accept. */
export function toProfileRelayBodies(events: RelayEvent[]): ProfileRelayBody[] {
  const refreshByReason = new Map<string, string[]>();
  const bodies: ProfileRelayBody[] = [];
  for (const event of events) {
    const reason = String(event.data.reason ?? "");
    if (event.name === REFRESH) {
      const ids = refreshByReason.get(reason) ?? [];
      ids.push(String(event.data.politicianId));
      refreshByReason.set(reason, ids);
    } else if (event.name === RECONCILE || event.name === RECONCILE_ACTIVE) {
      bodies.push({ profileReconcile: { reason, active: event.name === RECONCILE_ACTIVE } });
    } else {
      throw new Error(`Event ${event.name} cannot be relayed`);
    }
  }
  for (const [reason, politicianIds] of refreshByReason) {
    bodies.push({ profileRefresh: { politicianIds, reason } });
  }
  return bodies;
}
