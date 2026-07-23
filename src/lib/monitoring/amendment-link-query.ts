import type { Prisma } from "@/generated/prisma";
import { AMENDMENT_LINK_UNRESOLVABLE_IDS } from "@/config/amendment-link-unresolvable";

/**
 * Shared WHERE fragment for "a linkable AMENDEMENT vote still unlinked". Reused
 * by the freshness monitor, the sync-daily anomaly guard and the backfill loop
 * so the three agree on what counts toward the BLOCKING stall signal.
 *
 * Confirmed-unresolvable votes (explicit config) are excluded via `externalId
 * NOT IN (...)`. Nothing is excluded by age — the window bounds are the caller's
 * own scan scope, not a way to hide an unlinked vote.
 */
export function linkableUnlinkedVoteWhere(opts: {
  legislature: number;
  chamber?: "AN" | "SENAT";
  votingDate?: { gte?: Date; lte?: Date };
  /** Defaults to the confirmed-unresolvable config; injectable for tests. */
  unresolvableIds?: readonly string[];
}): Prisma.ScrutinWhereInput {
  const ids = opts.unresolvableIds ?? [...AMENDMENT_LINK_UNRESOLVABLE_IDS];
  return {
    legislature: opts.legislature,
    ...(opts.chamber ? { chamber: opts.chamber } : {}),
    type: "AMENDEMENT",
    dossierLegislatifId: { not: null },
    amendmentLinks: { none: {} },
    ...(opts.votingDate ? { votingDate: opts.votingDate } : {}),
    ...(ids.length ? { externalId: { notIn: [...ids] } } : {}),
  };
}
