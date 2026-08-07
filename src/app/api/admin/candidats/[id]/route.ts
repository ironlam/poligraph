import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { updateCandidatePresidentialSchema } from "@/lib/security/schemas";
import { getRequestMeta } from "@/lib/security/audit";
import { invalidateEntity } from "@/lib/cache";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";

export const PATCH = withAdminAuth(
  withValidation(updateCandidatePresidentialSchema, async (request, context, body) => {
    const { id } = await context.params;
    const existing = await db.candidacyPresidential.findUnique({
      where: { id },
      // electionId comes along on the existence check rather than in a second query: the hub
      // reads are tagged per election and need it to be invalidated.
      select: { id: true, candidacyId: true, candidacy: { select: { electionId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Métadonnées candidature non trouvées" }, { status: 404 });
    }
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
    const updated = await db.candidacyPresidential.update({
      where: { id },
      data: updateData,
    });
    const { ip, userAgent } = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "CandidacyPresidential",
        entityId: id!,
        changes: body,
        ipAddress: ip,
        userAgent: userAgent,
      },
    });
    invalidateEntity("election");
    // A PATCH can flip publicationStatus, which is exactly what opens or closes the four hub
    // surfaces. `invalidateEntity("election")` purges the `elections` tag and never reaches them.
    invalidatePresidentialCandidacyTags(existing.candidacy.electionId);
    return NextResponse.json(updated);
  })
);

export const DELETE = withAdminAuth(async (request, context) => {
  const { id } = await context.params;
  const existing = await db.candidacyPresidential.findUnique({
    where: { id },
    // Read before the delete, because the row is gone afterwards and the election id would need
    // a second query through the candidacy.
    select: { id: true, candidacyId: true, candidacy: { select: { electionId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Métadonnées candidature non trouvées" }, { status: 404 });
  }
  await db.candidacyPresidential.delete({ where: { id } });
  // NB: on ne supprime PAS la Candidacy associée. Si l'admin veut retirer
  // entièrement le candidat de l'élection, il passe par /admin/candidats UI
  // qui supprime la Candidacy elle-même (Task 4).
  const { ip, userAgent } = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "CandidacyPresidential",
      entityId: id!,
      changes: {},
      ipAddress: ip,
      userAgent: userAgent,
    },
  });
  invalidateEntity("election");
  // Deleting a PUBLISHED extension removes a candidacy from the subject pages, which can close a
  // subject that was open. Same tag as publication, same reason.
  invalidatePresidentialCandidacyTags(existing.candidacy.electionId);
  return NextResponse.json({ success: true });
});
