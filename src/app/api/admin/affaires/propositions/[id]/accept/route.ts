import { NextResponse, type NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { reviewProposalSchema } from "@/lib/security/schemas/affair-proposal";
import { acceptProposal } from "@/services/affairs/proposal-review";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";
import type { z } from "zod/v4";

// Affaires v2, lot 1: applies a pending proposal.
//
// Cache invalidation happens here, after acceptProposal has committed, so a
// rolled-back transaction never leaves a purged cache behind.

const REVIEWED_BY = "admin";

type Body = z.infer<typeof reviewProposalSchema>;

export const POST = withAdminAuth(
  withValidation(reviewProposalSchema, async (request: NextRequest, context, body: Body) => {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant" }, { status: 400 });
    }

    const result = await acceptProposal({
      proposalId: id,
      reviewedBy: REVIEWED_BY,
      reviewNotes: body.reviewNotes,
      requestMeta: getRequestMeta(request),
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
        case "not_pending":
          return NextResponse.json(
            { error: "Proposition déjà traitée", status: result.status },
            { status: 409 }
          );
        case "invalid_patch":
          return NextResponse.json(
            { error: "Patch invalide", issues: result.issues },
            { status: 422 }
          );
        case "conflict":
          return NextResponse.json(
            {
              error: "La valeur actuelle a changé depuis la proposition",
              conflictDetail: result.conflictDetail,
            },
            { status: 409 }
          );
      }
    }

    invalidateEntity("affair", result.affairSlug);
    invalidateAffectedPoliticians([result.politicianSlug]);

    return NextResponse.json({ ok: true, appliedFields: result.appliedFields });
  })
);
