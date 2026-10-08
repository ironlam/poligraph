import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getRequestMeta } from "@/lib/security";
import {
  eventActionSchema,
  eventDraftSchema,
  toDraftInput,
} from "@/lib/security/schemas/affair-event";
import {
  confirmEvent,
  deleteDraftEvent,
  publishEvent,
  retractEvent,
  updateDraftEvent,
} from "@/lib/affairs/events/service";
import { eventFailureResponse, invalidBodyResponse } from "@/lib/affairs/events/http";
import { invalidateEntity } from "@/lib/cache";
import { refreshProfilesForModeration } from "@/lib/politicians/profile-snapshot/moderation";

export const PATCH = withAdminAuth(async (request, { params }) => {
  const { id, eventId } = (await params) as { id: string; eventId: string };
  const parsed = eventDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBodyResponse(parsed.error.flatten());

  const converted = toDraftInput(parsed.data);
  if (!converted.ok) return invalidBodyResponse(converted.error);

  const result = await updateDraftEvent(id, eventId, converted.input, getRequestMeta(request));
  if (!result.ok) return eventFailureResponse(result, "Étape invalide");
  return NextResponse.json({ eventId: result.eventId });
});

export const DELETE = withAdminAuth(async (request, { params }) => {
  const { id, eventId } = (await params) as { id: string; eventId: string };
  const result = await deleteDraftEvent(id, eventId, getRequestMeta(request));
  if (!result.ok) return eventFailureResponse(result, "Étape invalide");
  return NextResponse.json({ eventId: result.eventId });
});

export const POST = withAdminAuth(async (request, { params }) => {
  const { id, eventId } = (await params) as { id: string; eventId: string };
  const parsed = eventActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBodyResponse(parsed.error.flatten());

  const body = parsed.data;
  const meta = getRequestMeta(request);
  const result =
    body.action === "PUBLISH"
      ? await publishEvent(id, eventId, meta)
      : body.action === "RETRACT"
        ? await retractEvent(id, eventId, body.reason, meta)
        : await confirmEvent(
            id,
            eventId,
            {
              sourceUrl: body.sourceUrl,
              sourceTitle: body.sourceTitle,
              sourceKind: body.sourceKind,
              outcome: body.outcome,
              corroborationUrl: body.corroborationUrl,
            },
            meta
          );

  if (!result.ok) {
    return eventFailureResponse(
      result,
      body.action === "RETRACT" ? "Étape invalide" : "Étape non publiable"
    );
  }

  invalidateEntity("affair", result.affairSlug);
  invalidateEntity("politician", result.politicianSlug);
  await refreshProfilesForModeration({ affairIds: [id] }, "admin:etape-affaire");
  return NextResponse.json({ eventId: result.eventId });
});
