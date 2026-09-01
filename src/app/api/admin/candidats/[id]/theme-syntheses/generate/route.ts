import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { generateCandidacyThemeSynthesis } from "@/services/candidacy-theme-synthesis/generation";

export const maxDuration = 120;

const generationSchema = z
  .object({
    theme: z.enum(THEMES_IN_ORDER),
    persist: z.boolean(),
  })
  .strict();

export const POST = withAdminAuth(
  withValidation(generationSchema, async (request, context, body) => {
    const { id } = await context.params;
    const { ip, userAgent } = getRequestMeta(request);
    const result = await generateCandidacyThemeSynthesis(id!, body.theme, {
      persist: body.persist,
      actor: { id: "admin", ipAddress: ip, userAgent },
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, reason: result.reason }, { status: 422 });
    }
    if (result.persisted) {
      // The new draft is admin-only, but publishing may immediately follow this request. Purging
      // here keeps the admin and public reads on one cache lifecycle without a global invalidation.
      invalidatePresidentialCandidacyTags(result.electionId);
    }
    return NextResponse.json(result);
  })
);
