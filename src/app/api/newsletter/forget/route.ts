import { NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withValidation } from "@/lib/security/validate";
import { forgetSchema } from "@/lib/security/schemas/newsletter";
import { db } from "@/lib/db";
import { describeMailjetError } from "@/lib/email/mailjet-error";

export const POST = withPublicRoute(
  withValidation(forgetSchema, async (_req, _ctx, body) => {
    const subscriber = await db.subscriber.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (!subscriber || subscriber.unsubscribeToken !== body.unsubscribeToken) {
      return NextResponse.json({ error: "Invalide" }, { status: 400 });
    }
    try {
      const { removeFromList } = await import("@/lib/email/mailjet");
      await removeFromList(subscriber.email);
    } catch (e) {
      console.error("[Newsletter] Mailjet remove during forget", describeMailjetError(e));
    }
    await db.subscriber.delete({ where: { id: subscriber.id } });
    return NextResponse.json({ success: true });
  })
);
