import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { getRequestMeta } from "@/lib/security/audit";
import { reviewCandidateSynthesisSchema } from "@/lib/security/schemas";
import { withValidation } from "@/lib/security/validate";
import { saveReviewedCandidateSynthesis } from "@/services/candidate-synthesis";

export const PATCH = withAdminAuth(
  withValidation(reviewCandidateSynthesisSchema, async (request, context, body) => {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    }

    const { ip, userAgent } = getRequestMeta(request);
    const result = await saveReviewedCandidateSynthesis(id, body.synthesis, {
      ipAddress: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    invalidatePresidentialCandidacyTags(result.electionId);
    return NextResponse.json({ success: true });
  })
);
