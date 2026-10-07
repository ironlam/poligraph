import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { deferReview, markReviewedNoChange } from "@/services/affairs/monitoring/actions";

// Round-trips through Date so that 2026-02-30 is refused instead of rolling over.
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Date invalide");

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("NO_CHANGE"), requestKey: z.string().uuid() }),
  z.object({
    action: z.literal("DEFER"),
    requestKey: z.string().uuid(),
    nextReviewAt: day,
    dueReason: z.enum(["DELIBERE", "AUDIENCE", "MANUEL"]),
    dueNote: z.string().max(140).optional(),
  }),
]);

const ACTOR_ID = "admin";

export const POST = withAdminAuth(async (request, { params }) => {
  const id = (await params).id as string;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Requête invalide", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const result =
    body.action === "NO_CHANGE"
      ? await markReviewedNoChange({ affairId: id, requestKey: body.requestKey, actorId: ACTOR_ID })
      : await deferReview({
          affairId: id,
          requestKey: body.requestKey,
          actorId: ACTOR_ID,
          nextReviewAt: new Date(`${body.nextReviewAt}T00:00:00Z`),
          dueReason: body.dueReason,
          dueNote: body.dueNote,
        });

  if (result.ok) return NextResponse.json({ deduped: result.deduped });
  if (result.reason === "date_not_future") {
    return NextResponse.json(
      { error: "La date doit être postérieure à aujourd'hui", reason: result.reason },
      { status: 422 }
    );
  }
  return NextResponse.json(
    {
      error:
        result.reason === "not_found" ? "Affaire introuvable" : "Aucun suivi pour cette affaire",
      reason: result.reason,
    },
    { status: 404 }
  );
});
