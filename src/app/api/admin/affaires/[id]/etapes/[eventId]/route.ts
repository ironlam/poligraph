import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getRequestMeta } from "@/lib/security";
import { withValidation } from "@/lib/security/validate";
import { eventActionSchema, eventDraftSchema } from "@/lib/security/schemas/affair-event";
import {
  confirmEvent,
  deleteDraftEvent,
  publishEvent,
  retractEvent,
  updateDraftEvent,
} from "@/lib/affairs/events/service";
import { eventFailureResponse } from "@/lib/affairs/events/http";
import { invalidateEntity } from "@/lib/cache";
import { refreshProfilesForModeration } from "@/lib/politicians/profile-snapshot/moderation";

export const PATCH = withAdminAuth(
  withValidation(eventDraftSchema, async (request, { params }, input) => {
    const { id, eventId } = (await params) as { id: string; eventId: string };
    const result = await updateDraftEvent(id, eventId, input, getRequestMeta(request));
    if (!result.ok) return eventFailureResponse(result, "Étape invalide");
    return NextResponse.json({ eventId: result.eventId });
  })
);

export const DELETE = withAdminAuth(async (request, { params }) => {
  const { id, eventId } = (await params) as { id: string; eventId: string };
  const result = await deleteDraftEvent(id, eventId, getRequestMeta(request));
  if (!result.ok) return eventFailureResponse(result, "Étape invalide");
  return NextResponse.json({ eventId: result.eventId });
});

export const POST = withAdminAuth(
  withValidation(eventActionSchema, async (request, { params }, body) => {
    const { id, eventId } = (await params) as { id: string; eventId: string };
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
  })
);
