import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { publishCandidacyThemeSynthesis } from "@/lib/presidentielle/candidacy-theme-synthesis-review";

const publishSchema = z
  .object({
    synthesisId: z.string().min(1),
    corpusFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const POST = withAdminAuth(
  withValidation(publishSchema, async (request, context, body) => {
    const { id } = await context.params;
    const { ip, userAgent } = getRequestMeta(request);
    const result = await publishCandidacyThemeSynthesis({
      candidacyId: id!,
      synthesisId: body.synthesisId,
      expectedCorpusFingerprint: body.corpusFingerprint,
      actor: { id: "admin", ipAddress: ip, userAgent },
    });
    if (!result.ok) {
      const status = result.reason === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: result.message, reason: result.reason }, { status });
    }
    invalidatePresidentialCandidacyTags(result.electionId);
    return NextResponse.json({ ok: true });
  })
);
