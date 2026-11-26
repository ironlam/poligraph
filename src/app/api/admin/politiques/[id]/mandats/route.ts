import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { createLocalMandateSchema } from "@/lib/security/schemas/mandate";
import { createLocalMandate } from "@/lib/mandates/create-local";
import { invalidateEntity } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import type { z } from "zod/v4";

type Body = z.infer<typeof createLocalMandateSchema>;

/**
 * POST /api/admin/politiques/[id]/mandats
 * Adds a local mandate typed by an admin to a profile. Party leaderships keep their own route
 * (`/api/admin/mandates`).
 */
export const POST = withAdminAuth(
  withValidation(createLocalMandateSchema, async (request, context, body: Body) => {
    const { id } = await context.params;
    const result = await createLocalMandate(id!, body, getRequestMeta(request));

    if (result.kind === "politician-not-found") {
      return NextResponse.json({ error: "Fiche non trouvée" }, { status: 404 });
    }
    if (result.kind === "commune-not-found") {
      return NextResponse.json(
        { error: `Aucune commune ne porte le code INSEE ${result.communeId}.` },
        { status: 400 }
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json(
        { error: "Ce mandat est déjà enregistré sur la fiche, à la même date de début." },
        { status: 409 }
      );
    }

    // After commit: the profile document first, then the caches that read the mandate.
    await requestProfileRefresh(
      { politicianIds: [result.politician.id] },
      "admin:mandat-local-créé"
    );
    invalidateEntity("mandate");
    invalidateEntity("politician", result.politician.slug);

    return NextResponse.json(result.mandate, { status: 201 });
  })
);
