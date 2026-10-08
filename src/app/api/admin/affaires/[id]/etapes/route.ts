import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getRequestMeta } from "@/lib/security";
import { withValidation } from "@/lib/security/validate";
import { eventDraftSchema } from "@/lib/security/schemas/affair-event";
import { createDraftEvent } from "@/lib/affairs/events/service";
import { eventFailureResponse } from "@/lib/affairs/events/http";

export const POST = withAdminAuth(
  withValidation(eventDraftSchema, async (request, { params }, input) => {
    const id = (await params).id as string;
    const result = await createDraftEvent(id, input, getRequestMeta(request));
    if (!result.ok) return eventFailureResponse(result, "Étape invalide");
    return NextResponse.json({ eventId: result.eventId }, { status: 201 });
  })
);
