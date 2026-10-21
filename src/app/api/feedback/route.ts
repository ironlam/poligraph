import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withValidation } from "@/lib/security/validate";
import { feedbackSchema } from "@/lib/security/schemas/feedback";
import { isMissingTableError } from "@/lib/data/commune-population";

/** Un navigateur envoie toujours Origin sur un POST : une origine différente n'est pas notre formulaire. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export const POST = withPublicRoute(async (request, context) => {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }

  return withValidation(feedbackSchema, async (_req, _ctx, body) => {
    // Un robot a rempli le champ piège : on répond comme si de rien n'était, sans rien enregistrer.
    if (body.website) return NextResponse.json({ success: true });

    try {
      await db.visitorFeedback.create({
        data: {
          category: body.category,
          message: body.message,
          pagePath: body.pagePath,
          contactEmail: body.contactEmail,
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "Le formulaire est momentanément indisponible." },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  })(request, context);
});
