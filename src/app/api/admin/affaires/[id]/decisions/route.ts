import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import {
  linkCourtDecisionSchema,
  unlinkCourtDecisionSchema,
  updateCourtDecisionLinkSchema,
  type LinkCourtDecisionBody,
  type UnlinkCourtDecisionBody,
  type UpdateCourtDecisionLinkBody,
} from "@/lib/security/schemas/court-decision";
import { invalidateEntity } from "@/lib/cache";

/**
 * Affair ↔ court decision links, from the admin (#536).
 *
 * Manages links only. No route here creates, edits or deletes a `CourtDecision`:
 * an unlink removes the join row and nothing else, and an orphaned decision is left
 * in place rather than cleaned up — a decision outlives the fiches citing it.
 *
 * None of these routes touches an affair's historical fields (`ecli`,
 * `pourvoiNumber`, `court`, `verdictDate`, `chamber`, `caseNumber`).
 */

async function readAffairAndDecision(affairId: string, courtDecisionId: string) {
  // Re-read both rows before writing: the caller's view can be stale, and linking a
  // decision that has since been removed would leave a dangling reference.
  const [affair, decision] = await Promise.all([
    db.affair.findUnique({
      where: { id: affairId },
      select: { id: true, politician: { select: { slug: true } } },
    }),
    db.courtDecision.findUnique({ where: { id: courtDecisionId }, select: { id: true } }),
  ]);
  return { affair, decision };
}

/** Links an existing decision to the affair. Idempotent. */
export const POST = withAdminAuth(
  withValidation(linkCourtDecisionSchema, async (request, context, body: LinkCourtDecisionBody) => {
    const { id: affairId } = await (context as { params: Promise<{ id: string }> }).params;
    const { affair, decision } = await readAffairAndDecision(affairId, body.courtDecisionId);

    if (!affair) return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
    if (!decision) return NextResponse.json({ error: "Décision non trouvée" }, { status: 404 });

    const meta = getRequestMeta(request);
    // One transaction: a link without its audit entry would leave no trace of who
    // attached which decision to which fiche.
    const created = await db.$transaction(async (tx) => {
      const existing = await tx.affairCourtDecision.findUnique({
        where: {
          affairId_courtDecisionId: { affairId, courtDecisionId: body.courtDecisionId },
        },
        select: { affairId: true },
      });
      if (existing) return false;

      await tx.affairCourtDecision.create({
        data: {
          affairId,
          courtDecisionId: body.courtDecisionId,
          notes: body.notes ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entityType: "AffairCourtDecision",
          entityId: affairId,
          changes: { courtDecisionId: body.courtDecisionId, notes: body.notes ?? null },
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      return true;
    });

    // After the transaction commits, never before.
    invalidateEntity("affair");
    if (affair.politician?.slug) invalidateEntity("politician", affair.politician.slug);

    return NextResponse.json({ success: true, created });
  })
);

/** Adds or clears the link note. Never touches the decision itself. */
export const PATCH = withAdminAuth(
  withValidation(
    updateCourtDecisionLinkSchema,
    async (request, context, body: UpdateCourtDecisionLinkBody) => {
      const { id: affairId } = await (context as { params: Promise<{ id: string }> }).params;
      const { affair, decision } = await readAffairAndDecision(affairId, body.courtDecisionId);

      if (!affair) return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
      if (!decision) return NextResponse.json({ error: "Décision non trouvée" }, { status: 404 });

      const meta = getRequestMeta(request);
      const updated = await db.$transaction(async (tx) => {
        const existing = await tx.affairCourtDecision.findUnique({
          where: {
            affairId_courtDecisionId: { affairId, courtDecisionId: body.courtDecisionId },
          },
          select: { notes: true },
        });
        if (!existing) return null;

        await tx.affairCourtDecision.update({
          where: {
            affairId_courtDecisionId: { affairId, courtDecisionId: body.courtDecisionId },
          },
          data: { notes: body.notes },
        });
        await tx.auditLog.create({
          data: {
            action: "UPDATE",
            entityType: "AffairCourtDecision",
            entityId: affairId,
            changes: {
              courtDecisionId: body.courtDecisionId,
              notes: body.notes,
              previousNotes: existing.notes,
            },
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        return true;
      });

      if (updated === null) {
        return NextResponse.json({ error: "Liaison non trouvée" }, { status: 404 });
      }

      invalidateEntity("affair");
      if (affair.politician?.slug) invalidateEntity("politician", affair.politician.slug);

      return NextResponse.json({ success: true });
    }
  )
);

/**
 * Removes the link. Deletes only `AffairCourtDecision`.
 *
 * The decision stays in place even if no affair cites it any more: it is an official
 * record, not a by-product of the fiche.
 */
export const DELETE = withAdminAuth(
  withValidation(
    unlinkCourtDecisionSchema,
    async (request, context, body: UnlinkCourtDecisionBody) => {
      const { id: affairId } = await (context as { params: Promise<{ id: string }> }).params;
      const { affair } = await readAffairAndDecision(affairId, body.courtDecisionId);

      if (!affair) return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });

      const meta = getRequestMeta(request);
      const deleted = await db.$transaction(async (tx) => {
        const result = await tx.affairCourtDecision.deleteMany({
          where: { affairId, courtDecisionId: body.courtDecisionId },
        });
        if (result.count === 0) return false;

        await tx.auditLog.create({
          data: {
            action: "DELETE",
            entityType: "AffairCourtDecision",
            entityId: affairId,
            changes: {
              courtDecisionId: body.courtDecisionId,
              // Said explicitly so an audit reader knows the decision survived.
              courtDecisionDeleted: false,
            },
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        return true;
      });

      invalidateEntity("affair");
      if (affair.politician?.slug) invalidateEntity("politician", affair.politician.slug);

      return NextResponse.json({ success: true, deleted });
    }
  )
);
