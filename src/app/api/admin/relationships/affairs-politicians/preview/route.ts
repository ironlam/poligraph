import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { previewAffairPoliticianReassignment } from "@/services/admin/affair-politician-workbench";

const schema = z.object({
  affairId: z.string().min(1).max(100),
  politicianId: z.string().min(1).max(100),
});

export const POST = withAdminAuth(
  withValidation(schema, async (_request, _context, body) => {
    try {
      return NextResponse.json(
        await previewAffairPoliticianReassignment(body.affairId, body.politicianId)
      );
    } catch (error) {
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
      throw error;
    }
  })
);
