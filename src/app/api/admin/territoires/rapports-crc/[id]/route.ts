import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";
import { rapportCrcActionSchema } from "@/lib/security/schemas/rapport-crc";
import { traiterRapportCrc } from "@/lib/territoires/rapports-crc-validation";

export const POST = withAdminAuth(
  withValidation(rapportCrcActionSchema, async (request, context, body) => {
    const { id } = await context.params;
    const result = await traiterRapportCrc(id!, body, getRequestMeta(request));
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.httpStatus });
    }
    return NextResponse.json({ id: result.id });
  })
);
