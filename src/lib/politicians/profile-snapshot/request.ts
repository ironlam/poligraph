import { db } from "@/lib/db";
import {
  defaultSend,
  PROFILE_INVALIDATION_CAP,
  PROFILE_RECONCILE_EVENT,
  PROFILE_REFRESH_EVENT,
  type Send,
} from "./events";

const SEND_BATCH_SIZE = 100;

export type ProfileRefreshTarget =
  | { politicianIds: string[] }
  | { partyId: string }
  | { factCheckId: string }
  // A sync that writes several fact-checks in one run asks once for all of them.
  | { factCheckIds: string[] }
  | { affairIds: string[] }
  // A scrutin's policy title shows on the profile of every politician whose recent votes include
  // it. Taking every voter over-approximates "one of the five latest votes" without a query per
  // politician; past the cap, the request turns into a reconcile anyway. A list, so a batch of
  // scrutins is checked against the cap once rather than once per scrutin.
  | { scrutinIds: string[] }
  // A dossier's title and status show on its authors' profiles.
  | { dossierId: string };

/**
 * Resolves every politician whose profile document depends on the written entity.
 * Not filtered on publication: the refresh itself skips non-public politicians.
 */
export async function resolveProfileTargets(target: ProfileRefreshTarget): Promise<string[]> {
  if ("politicianIds" in target) return [...new Set(target.politicianIds)];

  if ("partyId" in target) {
    const { partyId } = target;
    const rows = await db.politician.findMany({
      where: {
        // Every place the document shows a party: current, history, mandate, affair party-at-time.
        OR: [
          { currentPartyId: partyId },
          { partyHistory: { some: { partyId } } },
          { mandates: { some: { partyId } } },
          { affairs: { some: { partyAtTimeId: partyId } } },
        ],
      },
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

  if ("factCheckIds" in target) {
    if (target.factCheckIds.length === 0) return [];
    const rows = await db.factCheckMention.findMany({
      where: { factCheckId: { in: [...new Set(target.factCheckIds)] } },
      select: { politicianId: true },
    });
    return [...new Set(rows.map((r) => r.politicianId))];
  }

  if ("scrutinIds" in target) {
    if (target.scrutinIds.length === 0) return [];
    // groupBy, not findMany: the distinct is done in SQL, so a batch of scrutins returns one row
    // per voter instead of one per vote.
    const rows = await db.vote.groupBy({
      by: ["politicianId"],
      where: { scrutinId: { in: [...new Set(target.scrutinIds)] } },
    });
    return rows.map((r) => r.politicianId);
  }

  if ("dossierId" in target) {
    const rows = await db.dossierAuthor.findMany({
      where: { dossierId: target.dossierId },
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

/**
 * Asks for a recompute of the profile documents touched by a write. Never throws:
 * a write must not fail because of a recompute request, the reconcile job covers the gap.
 */
export async function requestProfileRefresh(
  target: ProfileRefreshTarget,
  reason: string,
  send: Send = defaultSend
): Promise<{ sent: number; mode: "targeted" | "reconcile" }> {
  let politicianIds: string[] = [];
  let mode: "targeted" | "reconcile" = "targeted";
  let sent = 0;
  try {
    politicianIds = await resolveProfileTargets(target);
    mode = politicianIds.length > PROFILE_INVALIDATION_CAP ? "reconcile" : "targeted";

    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.info(
      JSON.stringify({
        event: "[profile-snapshot] request",
        reason,
        count: politicianIds.length,
        mode,
      })
    );

    if (politicianIds.length === 0) return { sent: 0, mode };
    if (mode === "reconcile") {
      await send([{ name: PROFILE_RECONCILE_EVENT, data: { reason } }]);
      return { sent: 1, mode };
    }
    for (let i = 0; i < politicianIds.length; i += SEND_BATCH_SIZE) {
      const batch = politicianIds
        .slice(i, i + SEND_BATCH_SIZE)
        .map((politicianId) => ({ name: PROFILE_REFRESH_EVENT, data: { politicianId, reason } }));
      await send(batch);
      sent += batch.length;
    }
    return { sent, mode };
  } catch (error) {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.warn(
      JSON.stringify({
        event: "[profile-snapshot] request failed",
        reason,
        count: politicianIds.length,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return { sent, mode };
  }
}
