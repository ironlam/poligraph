import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import {
  enrichCourtDecisionSchema,
  type EnrichCourtDecisionBody,
} from "@/lib/security/schemas/court-decision";
import { enrichCourtDecisionFromJudilibre } from "@/services/affairs/enrich-court-decision";
import { invalidateEntity } from "@/lib/cache";

/**
 * Targeted Judilibre enrichment of one decision (#337).
 *
 * Manual and explicit: nothing here is scheduled, and no cron reaches this route.
 * The input is a judicial reference, never a name.
 *
 * The route writes no affair. It refreshes the decision's own official fields, which
 * the public fiche then renders through the dual read shipped with #536.
 */

/** Maps a refusal to a status code, so the admin sees why nothing was written. */
const REFUSAL_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  AMBIGUOUS: 409,
  CONFLICT: 409,
  NO_REFERENCE: 400,
  UNAVAILABLE: 503,
};

const REFUSAL_MESSAGE: Record<string, string> = {
  NOT_FOUND: "Aucune décision Judilibre ne correspond à cette référence.",
  AMBIGUOUS:
    "Plusieurs décisions portent ce pourvoi. Un pourvoi n'identifie pas une décision : " +
    "préciser l'identifiant Judilibre ou l'ECLI.",
  CONFLICT: "La réponse officielle contredit l'identité de cette décision. Rien n'a été écrit.",
  NO_REFERENCE: "Fournir une référence : identifiant Judilibre, ECLI ou numéro de pourvoi.",
  UNAVAILABLE: "L'accès à Judilibre n'est pas configuré sur cet environnement.",
};

export const POST = withAdminAuth(
  withValidation(
    enrichCourtDecisionSchema,
    async (request, context, body: EnrichCourtDecisionBody) => {
      const { id } = await (context as { params: Promise<{ id: string }> }).params;

      const decision = await db.courtDecision.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!decision) {
        return NextResponse.json({ error: "Décision non trouvée" }, { status: 404 });
      }

      const meta = getRequestMeta(request);
      const result = await enrichCourtDecisionFromJudilibre({
        courtDecisionId: id,
        judilibreId: body.judilibreId ?? null,
        ecli: body.ecli ?? null,
        pourvoiNumber: body.pourvoiNumber ?? null,
        triggeredBy: "admin",
        requestMeta: meta,
      });

      if (result.status === "UPDATED") {
        // Only after the transaction committed, and only for the fiches that cite it.
        const links = await db.affairCourtDecision.findMany({
          where: { courtDecisionId: id },
          select: { affair: { select: { politician: { select: { slug: true } } } } },
        });
        invalidateEntity("affair");
        for (const link of links) {
          const slug = link.affair?.politician?.slug;
          if (slug) invalidateEntity("politician", slug);
        }
        return NextResponse.json({
          status: result.status,
          judilibreId: result.judilibreId,
          changes: result.changes,
        });
      }

      if (result.status === "UNCHANGED") {
        return NextResponse.json({ status: result.status, judilibreId: result.judilibreId });
      }

      return NextResponse.json(
        { status: result.status, error: REFUSAL_MESSAGE[result.status], details: result },
        { status: REFUSAL_STATUS[result.status] ?? 400 }
      );
    }
  )
);
