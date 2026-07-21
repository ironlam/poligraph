/**
 * Remediation Phase A: per-scrutin DB repair applied to a reconciler transition
 * (see ./types ScrutinDossierTransition, produced by Task 4's reconcileScrutinDossier).
 *
 * Unpublish-first: resolvePublicTitle (src/lib/votes/resolve-public-title.ts) only
 * shows a policy title publicly when status === "APPROVED". Setting the row to
 * STALE therefore unpublishes it immediately, before anything about the dossier
 * link is touched. Every code path below (repaired, linkless, or blocked) leaves
 * an APPROVED title STALE, because the officialTitleSnapshot/policyTitle were
 * generated against the wrong dossier's amendments and can no longer be trusted.
 *
 * Two transaction boundaries:
 * - A1 (this file, tx client): idempotent invalidation snapshot + STALE + the
 *   Scrutin.dossierLegislatifId write + TITLE_REGEX link cleanup + the MANUAL
 *   link compatibility check. All-or-nothing.
 * - Between A1 and A2: linkScrutinsToAmendments runs OUTSIDE any transaction,
 *   because it uses the global `db` client internally (see
 *   @/services/sync/link-scrutins-to-amendments) and has no way to accept a
 *   transaction client. Re-linking after a dossier repoint can touch many rows
 *   and is idempotent on its own (composite PK + skipDuplicates), so it does not
 *   need A1's atomicity.
 * - A2 (this file, global db client): a single write deciding the title's
 *   regenerationStatus from the links that resulted from the re-link.
 */
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { linkScrutinsToAmendments } from "@/services/sync/link-scrutins-to-amendments";
import type { ScrutinDossierTransition } from "./types";

export const LINKLESS_WARNING = "DOSSIER_RECONCILIATION_LINKLESS";

export type RepairStatus =
  | "PENDING"
  | "DB_REPAIRED"
  | "BLOCKED_MANUAL_LINK"
  | "REGENERATED"
  | "REGEN_FAILED";

const INVALIDATION_ACTION = "dossier_reconciliation_invalidated";

/**
 * Merges a warning code into a currentWarnings JSON array without duplicating
 * it and without dropping any other warning already present. Only the code is
 * stored: unlike the richer { code, severity, message } GenerationWarning shape
 * used by the title generator (src/services/scrutin-policy-title/types.ts), the
 * reconciliation warning carries no severity/message here. Existing consumers
 * (WarningsPanel, approve-guard, the admin queue filters) tolerate a missing
 * severity/message (they render/compare as undefined, they do not throw), but a
 * maintainer may want to enrich this to the full shape in a follow-up.
 */
function mergeWarning(current: unknown, code: string): Prisma.InputJsonValue {
  const arr = Array.isArray(current) ? (current as { code?: string }[]) : [];
  if (arr.some((w) => w?.code === code)) return arr as unknown as Prisma.InputJsonValue;
  return [...arr, { code }] as unknown as Prisma.InputJsonValue;
}

export async function repairScrutinDossier(
  t: ScrutinDossierTransition,
  repairRunId: string
): Promise<{ scrutinId: string; repairStatus: RepairStatus; linkless: boolean }> {
  // --- Transaction A1: unpublish-first + dossier write + delete TITLE_REGEX links ---
  let blocked = false;
  await db.$transaction(async (tx) => {
    const title = await tx.scrutinPolicyTitle.findUnique({ where: { scrutinId: t.scrutinId } });
    if (title) {
      // Idempotency check: was a "dossier_reconciliation_invalidated" revision for
      // this exact repairRunId already written for this title? We check this in
      // JS rather than with a Postgres JSON-path WHERE filter
      // (snapshot: { path: ["repairRunId"], equals: repairRunId }). That filter
      // type-checks fine against Prisma's JsonFilterBase for the postgresql
      // provider, but there is no DATABASE_URL available in this environment to
      // confirm it actually executes as expected through the Prisma 7
      // driver-adapter (adapter-pg) query compiler, and this codebase has no
      // prior usage of JSON-path filtering to fall back on. The revision count
      // per title is small (one invalidation per repair run at most), so loading
      // them and comparing repairRunId in JS is simple and has no such risk.
      const priorInvalidations = await tx.scrutinPolicyTitleRevision.findMany({
        where: { policyTitleId: title.id, action: INVALIDATION_ACTION },
        select: { snapshot: true },
      });
      const already = priorInvalidations.some(
        (r) => (r.snapshot as { repairRunId?: string } | null)?.repairRunId === repairRunId
      );
      if (!already) {
        await tx.scrutinPolicyTitleRevision.create({
          data: {
            policyTitleId: title.id,
            action: INVALIDATION_ACTION,
            snapshot: {
              ...(title as unknown as object),
              repairRunId,
              transitionAction: t.action,
              previousDossierId: t.previousDossierId,
              appliedDossierId: t.appliedDossierId,
            } as Prisma.InputJsonValue,
          },
        });
      }
      if (title.status !== "STALE") {
        await tx.scrutinPolicyTitle.update({ where: { id: title.id }, data: { status: "STALE" } });
      }
    }

    // Incompatible MANUAL link check: a human curated this link, so a dossier
    // change that no longer matches it must block rather than silently drop it.
    const manual = await tx.scrutinAmendment.findMany({
      where: { scrutinId: t.scrutinId, source: "MANUAL" },
      select: { amendmentId: true, amendment: { select: { dossierId: true } } },
    });
    const incompatible = manual.some((m) => m.amendment.dossierId !== t.appliedDossierId);
    if (incompatible) {
      blocked = true;
      return; // Leave the title STALE (already applied above); no dossier/link mutation.
    }

    await tx.scrutin.update({
      where: { id: t.scrutinId },
      data: { dossierLegislatifId: t.appliedDossierId },
    });
    await tx.scrutinAmendment.deleteMany({
      where: { scrutinId: t.scrutinId, source: "TITLE_REGEX" },
    });
  });

  if (blocked)
    return { scrutinId: t.scrutinId, repairStatus: "BLOCKED_MANUAL_LINK", linkless: false };

  // --- Re-link OUTSIDE the transaction: linkScrutinsToAmendments uses the global
  //     `db` client internally and cannot be handed a transaction client. ---
  if (t.appliedDossierId !== null) {
    await linkScrutinsToAmendments({ scrutinIds: [t.scrutinId] });
  }

  // --- Transaction A2: title lifecycle from the links that resulted from the re-link ---
  const linkCount = await db.scrutinAmendment.count({ where: { scrutinId: t.scrutinId } });
  const title = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: t.scrutinId } });
  if (title) {
    if (linkCount > 0) {
      await db.scrutinPolicyTitle.update({
        where: { id: title.id },
        data: { status: "STALE", regenerationStatus: "queued" },
      });
    } else {
      await db.scrutinPolicyTitle.update({
        where: { id: title.id },
        data: {
          status: "STALE",
          regenerationStatus: "idle",
          currentWarnings: mergeWarning(title.currentWarnings, LINKLESS_WARNING),
        },
      });
    }
  }
  return { scrutinId: t.scrutinId, repairStatus: "DB_REPAIRED", linkless: linkCount === 0 };
}
