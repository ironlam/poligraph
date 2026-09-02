import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { createCandidacyPresidentialFromPickerSchema } from "@/lib/security/schemas";
import { getRequestMeta } from "@/lib/security/audit";
import { getCandidates2027ForModeration } from "@/lib/data/candidates";
import { invalidateEntity } from "@/lib/cache";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { syncCandidacySearchDocument } from "@/lib/presidentielle/search-sync";

export const GET = withAdminAuth(async () => {
  const items = await getCandidates2027ForModeration();
  return NextResponse.json({ items });
});

export const POST = withAdminAuth(
  withValidation(createCandidacyPresidentialFromPickerSchema, async (request, _ctx, data) => {
    type CreateOutcome =
      | {
          kind: "ok";
          candidacy: Awaited<ReturnType<typeof db.candidacy.create>>;
          presidential: Awaited<ReturnType<typeof db.candidacyPresidential.create>>;
        }
      | { kind: "error"; status: number; message: string };

    // TOCTOU: la garde de doublon vit dans la transaction pour limiter la fenêtre.
    // Une vraie protection demande un index unique partiel sur (electionId, politicianId)
    // (politicianId nullable pour les locales), à appliquer en migration SQL.
    const outcome: CreateOutcome = await db.$transaction(async (tx) => {
      const election = await tx.election.findUnique({
        where: { slug: data.electionSlug },
        select: { id: true },
      });
      if (!election) {
        return { kind: "error", status: 404, message: "Élection non trouvée" };
      }
      const politician = await tx.politician.findUnique({
        where: { id: data.politicianId },
        select: { id: true, fullName: true, currentPartyId: true },
      });
      if (!politician) {
        return { kind: "error", status: 404, message: "Politicien non trouvé" };
      }
      const existing = await tx.candidacy.findFirst({
        where: { electionId: election.id, politicianId: politician.id },
        select: { id: true },
      });
      if (existing) {
        return { kind: "error", status: 409, message: "Candidature déjà enregistrée" };
      }
      const candidacy = await tx.candidacy.create({
        data: {
          electionId: election.id,
          politicianId: politician.id,
          partyId: politician.currentPartyId,
          candidateName: politician.fullName,
          status: data.status,
          // Required by the schema when status is DECLARE (#660), optional otherwise.
          sourceUrl: data.sourceUrl,
          sourceLabel: data.sourceLabel,
        },
      });
      const presidential = await tx.candidacyPresidential.create({
        data: {
          candidacyId: candidacy.id,
          slogan: data.slogan,
          accentColor: data.accentColor,
          declaredAt: data.declaredAt ? new Date(data.declaredAt) : undefined,
          withdrewAt: data.withdrewAt ? new Date(data.withdrewAt) : undefined,
          withdrewReason: data.withdrewReason,
          rank: data.rank,
          notes: data.notes,
        },
      });
      await syncCandidacySearchDocument(tx, candidacy.id);
      return { kind: "ok", candidacy, presidential };
    });

    if (outcome.kind === "error") {
      return NextResponse.json({ error: outcome.message }, { status: outcome.status });
    }

    const { ip, userAgent } = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "CandidacyPresidential",
        entityId: outcome.presidential.id,
        changes: {
          electionSlug: data.electionSlug,
          politicianId: data.politicianId,
          status: data.status,
          sourceUrl: data.sourceUrl,
          sourceLabel: data.sourceLabel,
          slogan: data.slogan,
          accentColor: data.accentColor,
          declaredAt: data.declaredAt,
          withdrewAt: data.withdrewAt,
          withdrewReason: data.withdrewReason,
          rank: data.rank,
          notes: data.notes,
        },
        ipAddress: ip,
        userAgent: userAgent,
      },
    });

    invalidateEntity("election");
    // The hub reads gate on the extension's publication status, and `invalidateEntity("election")`
    // does not reach them. The election id comes from the row just created, so this costs no query.
    invalidatePresidentialCandidacyTags(outcome.candidacy.electionId);
    return NextResponse.json(
      { candidacy: outcome.candidacy, presidential: outcome.presidential },
      { status: 201 }
    );
  })
);
