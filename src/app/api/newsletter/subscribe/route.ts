import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withValidation } from "@/lib/security/validate";
import { subscribeSchema } from "@/lib/security/schemas/newsletter";
import { upsertSubscriber } from "@/lib/newsletter/subscribe";
import { describeMailjetError } from "@/lib/email/mailjet-error";

export const POST = withPublicRoute(
  withValidation(subscribeSchema, async (_req, _ctx, body) => {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = h.get("user-agent") ?? undefined;

    const email = body.email.toLowerCase().trim();

    const result = await upsertSubscriber({
      email,
      source: body.source,
      postalCode: body.postalCode,
      deputySlug: body.deputySlug,
      boussoleProfile: body.boussoleProfile,
      consentedAt: new Date(),
      ip,
      userAgent,
    });

    if (result.alreadyConfirmed) {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        message: "Tu es déjà abonné, à dimanche !",
      });
    }

    // House-managed double opt-in: send our own confirmation email.
    // Mailjet's native DOI is not used (the new Sinch UI made it cumbersome
    // to wire a custom redirect URL with our token). The user is added to
    // the Mailjet list ONLY after they click the confirmation link in the
    // /api/newsletter/confirm route. We always re-send the confirmation if
    // a previous attempt left the subscriber in PENDING_CONFIRMATION (the
    // first email may have been lost in spam).
    if (result.confirmationToken) {
      try {
        const { sendTransactional } = await import("@/lib/email/mailjet");
        const { renderConfirmDoiHtml, renderConfirmDoiText } =
          await import("@/lib/email/render-confirm-doi");
        const confirmUrl = `https://poligraph.fr/api/newsletter/confirm?token=${result.confirmationToken}`;
        await sendTransactional({
          to: email,
          subject: "Confirme ton inscription à Poligraph",
          html: renderConfirmDoiHtml({ confirmUrl }),
          text: renderConfirmDoiText({ confirmUrl }),
        });
      } catch (error) {
        console.error("[Newsletter] Confirmation email error:", describeMailjetError(error));
        return NextResponse.json(
          {
            error:
              "Impossible de t'envoyer l'email de confirmation. Réessaye dans quelques minutes.",
          },
          { status: 500 }
        );
      }
    }

    if (result.alreadyPending) {
      return NextResponse.json({
        success: true,
        alreadyPending: true,
        message: "Vérifie ta boîte mail pour confirmer ton inscription.",
      });
    }

    return NextResponse.json({
      success: true,
      created: result.created,
      reactivated: result.reactivated,
      message: "Un email de confirmation vous a été envoyé.",
    });
  })
);

const SUBSCRIBE_CORS_ORIGINS = ["https://boussole.poligraph.fr", "http://localhost:8081"];

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && SUBSCRIBE_CORS_ORIGINS.includes(origin) ? origin : "";
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...(allowedOrigin
        ? {
            "Access-Control-Allow-Origin": allowedOrigin,
            Vary: "Origin",
          }
        : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
