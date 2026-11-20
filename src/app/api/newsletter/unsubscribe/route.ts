import { NextRequest, NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { db } from "@/lib/db";
import { describeMailjetError } from "@/lib/email/mailjet-error";

export const GET = withPublicRoute(async (request: NextRequest) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || token.length < 20 || token.length > 128) {
    return NextResponse.redirect(new URL("/recap?error=invalid-token", url));
  }

  const subscriber = await db.subscriber.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!subscriber) {
    return NextResponse.redirect(new URL("/recap?error=invalid-token", url));
  }

  await db.subscriber.update({
    where: { id: subscriber.id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  try {
    const { removeFromList } = await import("@/lib/email/mailjet");
    await removeFromList(subscriber.email);
  } catch (e) {
    console.error("[Newsletter] Mailjet remove error", describeMailjetError(e));
  }

  return NextResponse.redirect(new URL("/recap?unsubscribed=1", url));
});
