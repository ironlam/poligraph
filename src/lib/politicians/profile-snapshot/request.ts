import { db } from "@/lib/db";

export const PROFILE_REFRESH_EVENT = "politician/profile.refresh";
export const PROFILE_RECONCILE_EVENT = "politician/profile.reconcile";
export const PROFILE_INVALIDATION_CAP = 2000;

const SEND_BATCH_SIZE = 100;

export type ProfileRefreshTarget =
  | { politicianIds: string[] }
  | { partyId: string }
  | { factCheckId: string }
  | { affairIds: string[] };

export type InngestEventPayload = { name: string; data: Record<string, unknown> };
type Send = (events: InngestEventPayload[]) => Promise<unknown>;

/**
 * Resolves every politician whose profile document depends on the written entity.
 * Not filtered on publication: the refresh itself skips non-public politicians.
 */
export async function resolveProfileTargets(target: ProfileRefreshTarget): Promise<string[]> {
  if ("politicianIds" in target) return [...new Set(target.politicianIds)];

  if ("partyId" in target) {
    const { partyId } = target;
    const rows = await db.politician.findMany({
      where: { OR: [{ currentPartyId: partyId }, { partyHistory: { some: { partyId } } }] },
      select: { id: true },
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  if ("factCheckId" in target) {
    const rows = await db.factCheckMention.findMany({
      where: { factCheckId: target.factCheckId },
      select: { politicianId: true },
    });
    return [...new Set(rows.map((r) => r.politicianId))];
  }

  const affairs = await db.affair.findMany({
    where: { id: { in: target.affairIds } },
    select: {
      id: true,
      politicianId: true,
      linkedAffair: { select: { politicianId: true } },
      linkedBy: { select: { politicianId: true } },
    },
  });
  const out = new Set<string>();
  for (const a of affairs) {
    out.add(a.politicianId);
    if (a.linkedAffair) out.add(a.linkedAffair.politicianId);
    for (const l of a.linkedBy) out.add(l.politicianId);
  }
  return [...out];
}

async function defaultSend(events: InngestEventPayload[]): Promise<unknown> {
  // Lazy import: resolving targets must not construct the Inngest client.
  const { inngest } = await import("@/inngest/client");
  return inngest.send(events);
}

/**
 * Asks for a recompute of the profile documents touched by a write. Never throws:
 * a write must not fail because of a recompute request, the reconcile job covers the gap.
 */
export async function requestProfileRefresh(
  target: ProfileRefreshTarget,
  reason: string,
  send: Send = defaultSend
): Promise<{ sent: number; mode: "targeted" | "reconcile" }> {
  const politicianIds = await resolveProfileTargets(target);
  const mode = politicianIds.length > PROFILE_INVALIDATION_CAP ? "reconcile" : "targeted";
  const count = politicianIds.length;

  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
  console.info(JSON.stringify({ event: "[profile-snapshot] request", reason, count, mode }));

  if (count === 0) return { sent: 0, mode };

  try {
    if (mode === "reconcile") {
      await send([{ name: PROFILE_RECONCILE_EVENT, data: { reason } }]);
      return { sent: 1, mode };
    }
    for (let i = 0; i < count; i += SEND_BATCH_SIZE) {
      await send(
        politicianIds
          .slice(i, i + SEND_BATCH_SIZE)
          .map((politicianId) => ({ name: PROFILE_REFRESH_EVENT, data: { politicianId, reason } }))
      );
    }
    return { sent: count, mode };
  } catch (error) {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.warn(
      JSON.stringify({
        event: "[profile-snapshot] request failed",
        reason,
        count,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return { sent: 0, mode };
  }
}
