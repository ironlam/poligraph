import { NextResponse, type NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { reviewProposalSchema } from "@/lib/security/schemas/affair-proposal";
import { rejectProposal } from "@/services/affairs/proposal-review";
import type { z } from "zod/v4";

// Affaires v2, lot 1: refuses a pending proposal. Nothing about the affair
// changes, so no cache invalidation.

const REVIEWED_BY = "admin";

type Body = z.infer<typeof reviewProposalSchema>;

export const POST = withAdminAuth(
  withValidation(reviewProposalSchema, async (request: NextRequest, context, body: Body) => {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant" }, { status: 400 });
    }

    const result = await rejectProposal({
      proposalId: id,
      reviewedBy: REVIEWED_BY,
      reviewNotes: body.reviewNotes,
      requestMeta: getRequestMeta(request),
    });

    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Proposition déjà traitée", status: result.status },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  })
);
