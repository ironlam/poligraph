import { NextRequest, NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { describeMailjetError } from "@/lib/email/mailjet-error";

export const GET = withPublicRoute(async (request: NextRequest) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || token.length < 20 || token.length > 128) {
    return NextResponse.redirect(new URL("/recap?error=invalid-confirmation", url));
  }

  const subscriber = await db.subscriber.findUnique({
    where: { confirmationToken: token },
  });
  if (!subscriber) {
    return NextResponse.redirect(new URL("/recap?error=invalid-confirmation", url));
  }

  if (subscriber.status === "PENDING_CONFIRMATION") {
    await db.subscriber.update({
      where: { id: subscriber.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    // Now that the subscriber confirmed, add them to the Mailjet list so
    // future weekly campaigns can reach them. Failures here don't block the
    // user-facing redirect; the next subscribe attempt or a manual sync will
    // recover. We swallow the error and log to Sentry.
    try {
      const { subscribeToNewsletter } = await import("@/lib/email/mailjet");
      await subscribeToNewsletter(subscriber.email);
    } catch (e) {
      console.error("[Newsletter] Mailjet list-add after confirm error:", describeMailjetError(e));
    }

    await inngest.send({
      name: "subscriber/confirmed",
      data: { subscriberId: subscriber.id },
    });
  }

  return NextResponse.redirect(new URL("/recap/bienvenue", url));
});
