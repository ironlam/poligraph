import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { updateCandidatePresidentialSchema } from "@/lib/security/schemas";
import { getRequestMeta } from "@/lib/security/audit";
import { invalidateEntity } from "@/lib/cache";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { syncPresidentialSearchDocumentsForCandidacy } from "@/lib/presidentielle/search-sync";
import { lockMeasureCandidacy } from "@/lib/measures/lock";

export const PATCH = withAdminAuth(
  withValidation(updateCandidatePresidentialSchema, async (request, context, body) => {
    const { id } = await context.params;
    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }
    // null passe à Prisma pour effacer le champ, undefined l'omet.
    // Asymétrie volontaire avec POST où null n'est pas dans le schéma.
    const updateData = {
      ...body,
      declaredAt: body.declaredAt ? new Date(body.declaredAt) : body.declaredAt,
      withdrewAt: body.withdrewAt ? new Date(body.withdrewAt) : body.withdrewAt,
    };
    const { ip, userAgent } = getRequestMeta(request);
    const outcome = await db.$transaction(async (tx) => {
      const target = await tx.candidacyPresidential.findUnique({
        where: { id },
        select: { candidacyId: true },
      });
      if (!target) return null;
      await lockMeasureCandidacy(tx, target.candidacyId);

      const existing = await tx.candidacyPresidential.findUnique({
        where: { id },
        select: {
          id: true,
          candidacyId: true,
          candidacy: {
            select: {
              electionId: true,
              status: true,
              sourceUrl: true,
              sourceLabel: true,
            },
          },
        },
      });
      if (!existing) return null;
      if (
        body.publicationStatus === "PUBLISHED" &&
        (!existing.candidacy.status ||
          !existing.candidacy.sourceUrl ||
          !existing.candidacy.sourceLabel)
      ) {
        return { kind: "unsourced" as const };
      }

      const updated = await tx.candidacyPresidential.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: "CandidacyPresidential",
          entityId: id!,
          changes: body,
          ipAddress: ip,
          userAgent: userAgent,
        },
      });
      await syncPresidentialSearchDocumentsForCandidacy(tx, existing.candidacyId);
      return {
        kind: "ok" as const,
        updated,
        electionId: existing.candidacy.electionId,
      };
    });

    if (!outcome) {
      return NextResponse.json({ error: "Métadonnées candidature non trouvées" }, { status: 404 });
    }
    if (outcome.kind === "unsourced") {
      return NextResponse.json(
        { error: "Une candidature publiée doit porter un statut, une URL et un libellé de source" },
        { status: 400 }
      );
    }
    invalidateEntity("election");
    // A PATCH can flip publicationStatus, which is exactly what opens or closes the four hub
    // surfaces. `invalidateEntity("election")` purges the `elections` tag and never reaches them.
    invalidatePresidentialCandidacyTags(outcome.electionId);
    return NextResponse.json(outcome.updated);
  })
);

export const DELETE = withAdminAuth(async (request, context) => {
  const { id } = await context.params;
  const { ip, userAgent } = getRequestMeta(request);
  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.candidacyPresidential.findUnique({
      where: { id },
      select: { candidacyId: true },
    });
    if (!target) return null;
    await lockMeasureCandidacy(tx, target.candidacyId);

    const existing = await tx.candidacyPresidential.findUnique({
      where: { id },
      select: { id: true, candidacyId: true, candidacy: { select: { electionId: true } } },
    });
    if (!existing) return null;
    await tx.candidacyPresidential.delete({ where: { id } });
    // The Candidacy remains: the hub field authority is independent of its editorial extension.
    await tx.auditLog.create({
      data: {
        action: "DELETE",
        entityType: "CandidacyPresidential",
        entityId: id!,
        changes: {},
        ipAddress: ip,
        userAgent: userAgent,
      },
    });
    await syncPresidentialSearchDocumentsForCandidacy(tx, existing.candidacyId);
    return { electionId: existing.candidacy.electionId };
  });
  if (!outcome) {
    return NextResponse.json({ error: "Métadonnées candidature non trouvées" }, { status: 404 });
  }
  invalidateEntity("election");
  // Deleting a PUBLISHED extension removes a candidacy from the subject pages, which can close a
  // subject that was open. Same tag as publication, same reason.
  invalidatePresidentialCandidacyTags(outcome.electionId);
  return NextResponse.json({ success: true });
});
