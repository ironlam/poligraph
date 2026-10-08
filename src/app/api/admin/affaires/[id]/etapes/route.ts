import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getRequestMeta } from "@/lib/security";
import { eventDraftSchema, toDraftInput } from "@/lib/security/schemas/affair-event";
import { createDraftEvent } from "@/lib/affairs/events/service";
import { eventFailureResponse, invalidBodyResponse } from "@/lib/affairs/events/http";

export const POST = withAdminAuth(async (request, { params }) => {
  const id = (await params).id as string;
  const parsed = eventDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBodyResponse(parsed.error.flatten());

  const converted = toDraftInput(parsed.data);
  if (!converted.ok) return invalidBodyResponse(converted.error);

  const result = await createDraftEvent(id, converted.input, getRequestMeta(request));
  if (!result.ok) return eventFailureResponse(result, "Étape invalide");
  return NextResponse.json({ eventId: result.eventId }, { status: 201 });
});
