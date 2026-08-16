import { NextRequest, NextResponse } from "next/server";
import { safeJsonParse } from "@/lib/api/safe-json";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { db } from "@/lib/db";
import { verifyMailjetBasicAuth } from "@/lib/newsletter/webhook-auth";

interface MailjetEvent {
  event: string;
  email: string;
  time: number;
}

export const POST = withPublicRoute(async (request: NextRequest) => {
  const secret = process.env.MAILJET_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Newsletter] MAILJET_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Mailjet does not sign webhook payloads (no HMAC in Sinch UI).
  // We authenticate via HTTP Basic Auth in the URL stored in Mailjet:
  //   https://mailjet:<secret>@poligraph.fr/api/newsletter/webhook
  if (!verifyMailjetBasicAuth(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  const parsed = safeJsonParse<MailjetEvent | MailjetEvent[]>(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  for (const event of events) {
    if (typeof event.email !== "string") continue;
    const subscriber = await db.subscriber.findUnique({
      where: { email: event.email.toLowerCase() },
    });
    if (!subscriber) continue;

    if (event.event === "open") {
      const openedAt =
        typeof event.time === "number" && Number.isFinite(event.time)
          ? new Date(event.time * 1000)
          : new Date();
      await db.subscriber.update({
        where: { id: subscriber.id },
        data: {
          lastOpenedAt: openedAt,
          consecutiveMisses: 0,
        },
      });
    } else if (event.event === "unsub" || event.event === "spam") {
      if (subscriber.status !== "UNSUBSCRIBED") {
        await db.subscriber.update({
          where: { id: subscriber.id },
          data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
        });
      }
    } else if (event.event === "bounce") {
      if (subscriber.status !== "BOUNCED") {
        await db.subscriber.update({
          where: { id: subscriber.id },
          data: { status: "BOUNCED" },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
});
