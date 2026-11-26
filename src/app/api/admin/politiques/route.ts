import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { createPoliticianSchema } from "@/lib/security/schemas/politician";
import { createDraftPolitician } from "@/lib/politicians/create-draft";
import type { z } from "zod/v4";

type CreateBody = z.infer<typeof createPoliticianSchema>;

/**
 * POST /api/admin/politiques
 * Creates a profile by hand, as a DRAFT. No cache is purged and no profile document is asked
 * for: a draft has no public page, and the admin lists are not cached.
 */
export const POST = withAdminAuth(
  withValidation(createPoliticianSchema, async (request, _context, body: CreateBody) => {
    const result = await createDraftPolitician(body, getRequestMeta(request));

    if (result.kind === "unseen-homonyms") {
      return NextResponse.json(
        {
          error:
            "Une fiche du même nom existe et ne vous a pas été montrée. Relisez la liste avant de créer.",
          homonyms: result.homonyms,
        },
        { status: 409 }
      );
    }
    if (result.kind === "slug-taken") {
      return NextResponse.json(
        { error: `L'identifiant d'URL « ${result.slug} » est déjà utilisé par une autre fiche.` },
        { status: 400 }
      );
    }
    return NextResponse.json(result.politician, { status: 201 });
  })
);
