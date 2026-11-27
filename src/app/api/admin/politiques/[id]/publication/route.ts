import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { profilePublicationSchema } from "@/lib/security/schemas/politician";
import { changeProfilePublication } from "@/lib/politicians/publication";
import { invalidateEntity } from "@/lib/cache";
import { refreshProfilesForModeration } from "@/lib/politicians/profile-snapshot/moderation";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import type { z } from "zod/v4";

type Body = z.infer<typeof profilePublicationSchema>;

/**
 * POST /api/admin/politiques/[id]/publication
 * The only admin path that changes a profile's publication status.
 */
export const POST = withAdminAuth(
  withValidation(profilePublicationSchema, async (request, context, body: Body) => {
    const { id } = await context.params;
    const result = await changeProfilePublication(id!, body.action, getRequestMeta(request));

    if (result.kind === "not-found") {
      return NextResponse.json({ error: "Fiche non trouvée" }, { status: 404 });
    }
    if (result.kind === "no-source") {
      return NextResponse.json(
        {
          error:
            "Cette fiche n'a ni mandat sourcé ni identifiant externe. Ajoutez une source avant de la publier.",
        },
        { status: 409 }
      );
    }
    if (result.kind === "has-published-affair") {
      const n = result.count;
      return NextResponse.json(
        {
          error: `Cette fiche a ${n} affaire${n > 1 ? "s" : ""} publiée${n > 1 ? "s" : ""}. Dépubliez-${n > 1 ? "les" : "la"} d'abord : une affaire publique ne peut pas renvoyer à une fiche retirée du site.`,
        },
        { status: 409 }
      );
    }
    if (result.kind === "unchanged") {
      return NextResponse.json({ publicationStatus: result.publicationStatus, changed: false });
    }

    // Synchronous on purpose: a profile taken off the site must have left before the admin
    // reads the response.
    await refreshProfilesForModeration(
      { politicianIds: [result.politician.id] },
      "admin:fiche-publication"
    );
    invalidateEntity("politician", result.politician.slug);
    for (const electionId of result.presidentialElectionIds) {
      invalidatePresidentialCandidacyTags(electionId);
    }

    return NextResponse.json({
      publicationStatus: result.politician.publicationStatus,
      changed: true,
    });
  })
);
