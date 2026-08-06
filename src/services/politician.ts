/**
 * Politician Service
 *
 * Centralized service for managing politician data, especially party affiliations.
 * This ensures consistency between `currentPartyId` and `PartyMembership`.
 *
 * IMPORTANT: Always use this service to change party affiliations.
 * Never update `currentPartyId` directly.
 */

import { db } from "@/lib/db";
import { Prisma, type PartyRole } from "@/generated/prisma";

export interface SetPartyOptions {
  /** Start date of the new affiliation (defaults to now) */
  startDate?: Date;
  /** End the previous membership (defaults to true) */
  endPreviousMembership?: boolean;
  /** Role in the party (defaults to MEMBRE) */
  role?: PartyRole;
}

/**
 * Ordering used whenever we need "the most recent open affiliation".
 *
 * startDate is nullable and Postgres sorts NULLS FIRST on a descending order, so an
 * affiliation with an unknown start date would otherwise be picked as the most recent
 * one. createdAt breaks remaining ties deterministically.
 */
export const OPEN_MEMBERSHIP_ORDER_BY: Prisma.PartyMembershipOrderByWithRelationInput[] = [
  { startDate: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
];

/** Minimal read surface, so this works with `db` and with a transaction client alike. */
export type PartyMembershipReader = {
  partyMembership: {
    findFirst: (args: {
      where: { politicianId: string; partyId?: string; endDate: null };
      orderBy: Prisma.PartyMembershipOrderByWithRelationInput[];
    }) => Promise<{ id: string; partyId: string; startDate: Date | null } | null>;
  };
};

/**
 * Which open affiliation is the one the current party points at.
 *
 * A politician can hold several open affiliations at once (a main party plus a
 * micro-party). "The most recent open one" is therefore not a safe proxy for "the
 * current party": promoting the wrong row silently rewrites a politician's displayed
 * party. Deliberate editorial choices, carried by currentPartyId, win.
 */
export async function findCurrentOpenMembership(
  politicianId: string,
  currentPartyId: string | null,
  client: PartyMembershipReader = db as unknown as PartyMembershipReader
): Promise<{ id: string; partyId: string; startDate: Date | null } | null> {
  if (currentPartyId) {
    const matching = await client.partyMembership.findFirst({
      where: { politicianId, partyId: currentPartyId, endDate: null },
      orderBy: OPEN_MEMBERSHIP_ORDER_BY,
    });
    if (matching) return matching;
  }

  return client.partyMembership.findFirst({
    where: { politicianId, endDate: null },
    orderBy: OPEN_MEMBERSHIP_ORDER_BY,
  });
}

/**
 * In-memory twin of findCurrentOpenMembership, for the two functions that sweep every
 * politician in one query. Calling the query-based helper per politician would turn a
 * single findMany into tens of thousands of round trips.
 *
 * `openMemberships` must already be ordered by OPEN_MEMBERSHIP_ORDER_BY.
 */
function pickCurrentOpenMembership<T extends { partyId: string }>(
  openMemberships: T[],
  currentPartyId: string | null
): T | null {
  if (currentPartyId) {
    const matching = openMemberships.find((m) => m.partyId === currentPartyId);
    if (matching) return matching;
  }
  return openMemberships[0] ?? null;
}

export interface SetCurrentPartyResult {
  /** The membership now backing currentPartyId, created or promoted. */
  membershipId: string | null;
  /** The membership this call closed, if any. */
  closedMembershipId: string | null;
}

/**
 * Set the current party for a politician.
 *
 * This function:
 * 1. Ends the open membership matching currentPartyId (if any), promoting an existing
 *    parallel affiliation for the incoming party instead of duplicating it
 * 2. Updates the politician's currentPartyId
 *
 * @example
 * await politicianService.setCurrentParty("politician-id", "party-id");
 * await politicianService.setCurrentParty("politician-id", null); // Remove party
 */
export async function setCurrentParty(
  politicianId: string,
  partyId: string | null,
  options: SetPartyOptions = {}
): Promise<SetCurrentPartyResult> {
  const hasExplicitStartDate = options.startDate !== undefined;
  const { startDate = new Date(), endPreviousMembership = true, role } = options;

  return db.$transaction(async (tx) => {
    const politician = await tx.politician.findUnique({
      where: { id: politicianId },
      select: { currentPartyId: true },
    });

    const currentMembership = await findCurrentOpenMembership(
      politicianId,
      politician?.currentPartyId ?? null,
      tx as unknown as PartyMembershipReader
    );

    let closedMembershipId: string | null = null;
    if (endPreviousMembership && currentMembership && currentMembership.partyId !== partyId) {
      await tx.partyMembership.update({
        where: { id: currentMembership.id },
        data: { endDate: startDate },
      });
      closedMembershipId = currentMembership.id;
    }

    // An open membership for the incoming party may already exist as a parallel
    // affiliation. Promote it rather than adding a second open row for the same party.
    const existingOpenForParty = partyId
      ? await tx.partyMembership.findFirst({
          where: { politicianId, partyId, endDate: null },
          orderBy: OPEN_MEMBERSHIP_ORDER_BY,
        })
      : null;

    // Whether the incoming party is actually replacing the current one. When the
    // incoming party already IS currentPartyId, existingOpenForParty is the very row
    // backing it, and this call is a no-op for that row: applying startDate/role here
    // would silently rewrite a sourced date on every no-op re-save.
    const isPromotion = politician?.currentPartyId !== partyId;

    let membershipId: string | null = existingOpenForParty?.id ?? null;
    if (partyId && existingOpenForParty) {
      // Promoting a parallel affiliation to main. Apply what the caller supplied, and
      // nothing else: four of the five sync callers pass no startDate, but careers.ts
      // does, so the hasExplicitStartDate guard alone is not sufficient. Gating on
      // isPromotion as well is what protects the row when it is already current.
      const promotionData: Prisma.PartyMembershipUpdateInput = {};
      if (isPromotion && hasExplicitStartDate) promotionData.startDate = startDate;
      if (isPromotion && role) promotionData.role = role;

      if (Object.keys(promotionData).length > 0) {
        await tx.partyMembership.update({
          where: { id: existingOpenForParty.id },
          data: promotionData,
        });
      }
    } else if (partyId) {
      const created = await tx.partyMembership.create({
        data: {
          politicianId,
          partyId,
          startDate,
          ...(role && { role }),
        },
      });
      membershipId = created.id;
    }

    await tx.politician.update({
      where: { id: politicianId },
      data: { currentPartyId: partyId },
    });

    return { membershipId, closedMembershipId };
  });
}

/**
 * Remove the current party for a politician.
 *
 * This closes the affiliation of the current party and sets currentPartyId to null.
 * A politician can hold several open affiliations at once (a main party plus a
 * micro-party), so we must specify partyId to close only the one backing currentPartyId.
 */
export async function removeParty(politicianId: string, endDate: Date = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    // Read inside the transaction: a politician can hold parallel open affiliations, and
    // only the one backing currentPartyId is the party being removed.
    const politician = await tx.politician.findUnique({
      where: { id: politicianId },
      select: { currentPartyId: true },
    });

    if (politician?.currentPartyId) {
      await tx.partyMembership.updateMany({
        where: {
          politicianId,
          partyId: politician.currentPartyId,
          endDate: null,
        },
        data: { endDate },
      });
    }

    // Clear currentPartyId
    await tx.politician.update({
      where: { id: politicianId },
      data: { currentPartyId: null },
    });
  });
}

/**
 * Set the role on an existing party membership, or create a new one.
 *
 * Use this to assign roles like FONDATEUR, PORTE_PAROLE, etc.
 * If the politician has a current membership with this party, it updates the role.
 * Otherwise, it creates a new membership with the given role and no end date.
 */
export async function setPartyRole(
  politicianId: string,
  partyId: string,
  role: PartyRole
): Promise<void> {
  // Find existing membership for this party (current = no endDate)
  const existing = await db.partyMembership.findFirst({
    where: {
      politicianId,
      partyId,
      endDate: null,
      role,
    },
  });

  if (existing) return; // Already has this role

  // Check if there's a MEMBRE membership we can upgrade
  const memberMembership = await db.partyMembership.findFirst({
    where: {
      politicianId,
      partyId,
      endDate: null,
      role: "MEMBRE",
    },
  });

  if (memberMembership) {
    // Upgrade existing MEMBRE to the new role
    await db.partyMembership.update({
      where: { id: memberMembership.id },
      data: { role },
    });
  } else {
    // Create a new membership with the role
    await db.partyMembership.create({
      data: {
        politicianId,
        partyId,
        role,
        startDate: new Date(),
      },
    });
  }
}

/**
 * Sync currentPartyId from PartyMembership for all politicians.
 *
 * Use this to fix inconsistencies between the two.
 * The current party is the open affiliation matching currentPartyId, or failing that,
 * the most recent open one.
 *
 * Invariant to keep in mind before wiring this into a scheduled job: after removeParty,
 * a politician can hold open affiliations with a null currentPartyId, and in that state
 * this function promotes the most recent open one, which may be a micro-party. The admin
 * API refuses to create that same state deliberately, so revisit this fallback first.
 */
export async function syncAllCurrentParties(): Promise<{
  updated: number;
  errors: string[];
}> {
  const politicians = await db.politician.findMany({
    select: {
      id: true,
      currentPartyId: true,
      partyHistory: {
        where: { endDate: null },
        orderBy: OPEN_MEMBERSHIP_ORDER_BY,
        select: { partyId: true },
      },
    },
  });

  let updated = 0;
  const errors: string[] = [];

  for (const p of politicians) {
    const expectedPartyId =
      pickCurrentOpenMembership(p.partyHistory, p.currentPartyId)?.partyId ?? null;

    if (p.currentPartyId !== expectedPartyId) {
      try {
        await db.politician.update({
          where: { id: p.id },
          data: { currentPartyId: expectedPartyId },
        });
        updated++;
      } catch (error) {
        errors.push(`Failed to update ${p.id}: ${error}`);
      }
    }
  }

  return { updated, errors };
}

/**
 * Audit party consistency for all politicians.
 *
 * Returns a list of politicians where currentPartyId doesn't match the current
 * PartyMembership. The current party is the open affiliation matching currentPartyId,
 * or failing that, the most recent open one.
 */
export async function auditPartyConsistency(): Promise<
  Array<{
    politicianId: string;
    fullName: string;
    currentPartyId: string | null;
    expectedPartyId: string | null;
    currentPartyName: string | null;
    expectedPartyName: string | null;
  }>
> {
  const politicians = await db.politician.findMany({
    select: {
      id: true,
      fullName: true,
      currentPartyId: true,
      currentParty: { select: { shortName: true } },
      partyHistory: {
        where: { endDate: null },
        orderBy: OPEN_MEMBERSHIP_ORDER_BY,
        select: {
          partyId: true,
          party: { select: { shortName: true } },
        },
      },
    },
  });

  const inconsistencies = [];

  for (const p of politicians) {
    const expected = pickCurrentOpenMembership(p.partyHistory, p.currentPartyId);
    const expectedPartyId = expected?.partyId ?? null;

    if (p.currentPartyId !== expectedPartyId) {
      inconsistencies.push({
        politicianId: p.id,
        fullName: p.fullName,
        currentPartyId: p.currentPartyId,
        expectedPartyId,
        currentPartyName: p.currentParty?.shortName ?? null,
        expectedPartyName: expected?.party.shortName ?? null,
      });
    }
  }

  return inconsistencies;
}

/**
 * Get party history for a politician.
 */
export async function getPartyHistory(politicianId: string) {
  return db.partyMembership.findMany({
    where: { politicianId },
    orderBy: { startDate: "desc" },
    include: {
      party: {
        select: {
          id: true,
          name: true,
          shortName: true,
          color: true,
        },
      },
    },
  });
}

export const politicianService = {
  setCurrentParty,
  removeParty,
  setPartyRole,
  syncAllCurrentParties,
  auditPartyConsistency,
  getPartyHistory,
};
