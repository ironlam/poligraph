import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { updatePartySchema } from "@/lib/security/schemas/party";
import { invalidateEntity } from "@/lib/cache";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { syncCandidacySearchDocumentsForParty } from "@/lib/presidentielle/search-sync";
import type { z } from "zod/v4";

type UpdateBody = z.infer<typeof updatePartySchema>;

export const GET = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  const party = await db.party.findUnique({
    where: { id },
    include: {
      predecessor: {
        select: { id: true, name: true, shortName: true },
      },
    },
  });

  if (!party) {
    return NextResponse.json({ error: "Parti non trouvé" }, { status: 404 });
  }

  return NextResponse.json(party);
});

export const PUT = withAdminAuth(
  withValidation(updatePartySchema, async (request, context, body: UpdateBody) => {
    const { id } = await context.params;

    // Check if slug is unique (excluding current party)
    const existingSlug = await db.party.findFirst({
      where: {
        slug: body.slug,
        NOT: { id },
      },
    });

    if (existingSlug) {
      return NextResponse.json(
        { error: "Ce slug est déjà utilisé par un autre parti" },
        { status: 400 }
      );
    }

    // Check if shortName is unique (excluding current party)
    const existingShortName = await db.party.findFirst({
      where: {
        shortName: body.shortName,
        NOT: { id },
      },
    });

    if (existingShortName) {
      return NextResponse.json(
        { error: "Cette abréviation est déjà utilisée par un autre parti" },
        { status: 400 }
      );
    }

    // Prevent circular predecessor references
    if (body.predecessorId) {
      let currentId: string | null = body.predecessorId;
      const visited = new Set<string>([id!]);

      while (currentId) {
        if (visited.has(currentId)) {
          return NextResponse.json(
            { error: "Référence circulaire détectée dans la chaîne des prédécesseurs" },
            { status: 400 }
          );
        }
        visited.add(currentId);

        const predecessor: { predecessorId: string | null } | null = await db.party.findUnique({
          where: { id: currentId },
          select: { predecessorId: true },
        });

        currentId = predecessor?.predecessorId || null;
      }
    }

    const { updatedParty, presidentialElectionIds } = await db.$transaction(async (tx) => {
      const candidacies = await tx.candidacy.findMany({
        where: { partyId: id, election: { type: "PRESIDENTIELLE" } },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      for (const candidacy of candidacies) {
        await lockMeasureCandidacy(tx, candidacy.id);
      }

      const updatedParty = await tx.party.update({
        where: { id },
        data: {
          slug: body.slug,
          name: body.name,
          shortName: body.shortName,
          description: body.description || null,
          color: body.color || null,
          foundedDate: body.foundedDate ? new Date(body.foundedDate) : null,
          dissolvedDate: body.dissolvedDate ? new Date(body.dissolvedDate) : null,
          politicalPosition: body.politicalPosition || null,
          politicalPositionSource: body.politicalPositionSource || null,
          politicalPositionSourceUrl: body.politicalPositionSourceUrl || null,
          politicalPositionOverride: body.politicalPositionOverride ?? false,
          ideology: body.ideology || null,
          headquarters: body.headquarters || null,
          website: body.website || null,
          predecessorId: body.predecessorId || null,
        },
      });
      const presidentialElectionIds = await syncCandidacySearchDocumentsForParty(tx, id!);
      return { updatedParty, presidentialElectionIds };
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Party",
        entityId: id!,
        changes: { name: updatedParty.name, shortName: updatedParty.shortName },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("party", updatedParty.slug ?? undefined);
    invalidateEntity("stats");
    for (const electionId of presidentialElectionIds) {
      invalidatePresidentialCandidacyTags(electionId);
    }

    return NextResponse.json(updatedParty);
  })
);

export const DELETE = withAdminAuth(async (request: NextRequest, context) => {
  const { id } = await context.params;

  // Check if party has any references
  const party = await db.party.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          politicians: true,
          partyMemberships: true,
          affairsAtTime: true,
          pressMentions: true,
        },
      },
    },
  });

  if (!party) {
    return NextResponse.json({ error: "Parti non trouvé" }, { status: 404 });
  }

  if (party._count.politicians > 0) {
    return NextResponse.json(
      {
        error: `Ce parti a ${party._count.politicians} membres actuels. Supprimez d'abord les liens.`,
      },
      { status: 400 }
    );
  }

  if (party._count.partyMemberships > 0) {
    return NextResponse.json(
      {
        error: `Ce parti a ${party._count.partyMemberships} adhésions historiques. Supprimez d'abord l'historique.`,
      },
      { status: 400 }
    );
  }

  if (party._count.affairsAtTime > 0) {
    return NextResponse.json(
      {
        error: `Ce parti est référencé dans ${party._count.affairsAtTime} affaires judiciaires. Supprimez d'abord les références.`,
      },
      { status: 400 }
    );
  }

  if (party._count.pressMentions > 0) {
    return NextResponse.json(
      {
        error: `Ce parti est mentionné dans ${party._count.pressMentions} articles de presse. Supprimez d'abord les mentions.`,
      },
      { status: 400 }
    );
  }

  // Delete associated external IDs first, then the party
  await db.externalId.deleteMany({ where: { partyId: id } });
  await db.party.delete({ where: { id } });

  const meta = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "Party",
      entityId: id!,
      changes: { name: party.name, shortName: party.shortName },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  invalidateEntity("party", party.slug ?? undefined);
  invalidateEntity("stats");

  return NextResponse.json({ success: true });
});
