import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import {
  AffairReassignmentConflictError,
  getAffairReassignmentContext,
  reassignAffairPolitician,
} from "@/services/admin/affair-politician-workbench";

const schema = z.object({
  affairId: z.string().min(1).max(100),
  politicianId: z.string().min(1).max(100),
  justification: z.string().trim().min(20).max(2000),
  confirmation: z.string().trim().min(1).max(500),
  expected: z.object({
    affairId: z.string().min(1),
    politicianId: z.string().min(1),
    slug: z.string().min(1),
    publicationStatus: z.string().min(1),
    updatedAt: z.string().datetime(),
    stateToken: z.string().length(64),
  }),
});

export const GET = withAdminAuth(async (request: NextRequest) => {
  const affairId = new URL(request.url).searchParams.get("affairId");
  if (!affairId || affairId.length > 100) {
    return NextResponse.json({ error: "Affaire requise" }, { status: 400 });
  }
  const context = await getAffairReassignmentContext(affairId);
  if (!context) return NextResponse.json({ error: "Affaire introuvable" }, { status: 404 });
  return NextResponse.json(context);
});

export const POST = withAdminAuth(
  withValidation(schema, async (_request, _context, body) => {
    try {
      return NextResponse.json(await reassignAffairPolitician(body));
    } catch (error) {
      if (error instanceof AffairReassignmentConflictError) {
        return NextResponse.json(
          { error: error.message, code: "AFFAIR_REASSIGNMENT_CONFLICT" },
          { status: 409 }
        );
      }
      if (error instanceof Error && error.message === "AFFAIR_NOT_FOUND") {
        return NextResponse.json({ error: "Affaire introuvable" }, { status: 404 });
      }
      if (error instanceof Error && error.message === "POLITICIAN_NOT_FOUND") {
        return NextResponse.json({ error: "Personnalité politique introuvable" }, { status: 404 });
      }
      if (error instanceof Error && error.message === "SAME_POLITICIAN") {
        return NextResponse.json(
          { error: "La personnalité proposée est déjà liée à cette affaire" },
          { status: 409 }
        );
      }
      if (error instanceof Error && error.message === "CONFIRMATION_REQUIRED") {
        return NextResponse.json(
          { error: "La confirmation doit reprendre exactement le titre de l’affaire" },
          { status: 400 }
        );
      }
      if (error instanceof Error && error.message === "JUSTIFICATION_TOO_SHORT") {
        return NextResponse.json(
          { error: "La justification est trop courte pour cette réattribution" },
          { status: 400 }
        );
      }
      throw error;
    }
  })
);
