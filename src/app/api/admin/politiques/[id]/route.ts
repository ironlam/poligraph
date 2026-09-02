import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { updatePoliticianSchema } from "@/lib/security/schemas/politician";
import { generateSlug } from "@/lib/utils";
import { invalidateEntity } from "@/lib/cache";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { syncPresidentialSearchDocumentsForCandidacy } from "@/lib/presidentielle/search-sync";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import type { DataSource, PublicationStatus } from "@/generated/prisma";
import type { z } from "zod/v4";

type UpdateBody = z.infer<typeof updatePoliticianSchema>;

export const GET = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  const politician = await db.politician.findUnique({
    where: { id },
    include: {
      currentParty: true,
      externalIds: true,
      mandates: { where: { isCurrent: true } },
    },
  });

  if (!politician) {
    return NextResponse.json({ error: "Politique non trouvé" }, { status: 404 });
  }

  return NextResponse.json(politician);
});

export const PUT = withAdminAuth(
  withValidation(updatePoliticianSchema, async (request, context, body: UpdateBody) => {
    const { id } = await context.params;

    // Check politician exists
    const existing = await db.politician.findUnique({
      where: { id },
      include: { externalIds: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Politique non trouvé" }, { status: 404 });
    }

    // Generate fullName and slug if needed
    const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`;
    const slug = body.slug?.trim() || generateSlug(fullName);

    // Check slug uniqueness (if changed)
    if (slug !== existing.slug) {
      const slugExists = await db.politician.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (slugExists) {
        return NextResponse.json(
          { error: "Ce slug est déjà utilisé par un autre politique" },
          { status: 400 }
        );
      }
    }

    // Update politician
    const { politician, presidentialElectionIds } = await db.$transaction(async (tx) => {
      const candidacies = await tx.candidacy.findMany({
        where: { politicianId: id, election: { type: "PRESIDENTIELLE" } },
        select: { id: true, electionId: true },
        orderBy: { id: "asc" },
      });
      for (const candidacy of candidacies) {
        await lockMeasureCandidacy(tx, candidacy.id);
      }

      const politician = await tx.politician.update({
        where: { id },
        data: {
          slug,
          civility: body.civility || null,
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          fullName,
          birthDate: body.birthDate ? new Date(body.birthDate) : null,
          birthPlace: body.birthPlace || null,
          photoUrl: body.photoUrl || null,
          photoSource: body.photoSource || null,
          currentPartyId: body.currentPartyId || null,
          deathDate: body.deathDate ? new Date(body.deathDate) : null,
          biography: body.biography || null,
          publicationStatus:
            (body.publicationStatus as PublicationStatus) || existing.publicationStatus,
        },
      });
      for (const candidacy of candidacies) {
        // Slug/name changes rewrite canonical result URLs; a publication loss closes candidate and
        // measure documents before the politician update can commit.
        await syncPresidentialSearchDocumentsForCandidacy(tx, candidacy.id);
      }
      return {
        politician,
        presidentialElectionIds: [...new Set(candidacies.map((c) => c.electionId))],
      };
    });

    // Handle external IDs
    const externalIds = body.externalIds ?? [];

    // Strategy: delete removed ones, update existing, create new ones
    const existingIds = existing.externalIds.map((e) => e.id);
    const newIds = externalIds.filter((e) => e.id).map((e) => e.id!);

    // Delete removed IDs
    const toDelete = existingIds.filter((eid) => !newIds.includes(eid));
    if (toDelete.length > 0) {
      await db.externalId.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    // Upsert each external ID
    for (const extId of externalIds) {
      if (!extId.externalId?.trim()) continue;

      if (extId.id) {
        // Update existing
        await db.externalId.update({
          where: { id: extId.id },
          data: {
            source: extId.source as DataSource,
            externalId: extId.externalId.trim(),
            url: extId.url || null,
          },
        });
      } else {
        // Create new - check for duplicates first
        const exists = await db.externalId.findUnique({
          where: {
            source_externalId: {
              source: extId.source as DataSource,
              externalId: extId.externalId.trim(),
            },
          },
        });

        if (exists) {
          // Update the existing record to point to this politician
          await db.externalId.update({
            where: { id: exists.id },
            data: {
              politicianId: id,
              url: extId.url || null,
            },
          });
        } else {
          // Create new
          await db.externalId.create({
            data: {
              politicianId: id,
              source: extId.source as DataSource,
              externalId: extId.externalId.trim(),
              url: extId.url || null,
            },
          });
        }
      }
    }

    // Log action
    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Politician",
        entityId: politician.id,
        changes: {
          fullName: politician.fullName,
          photoUrl: politician.photoUrl,
          publicationStatus: politician.publicationStatus,
          externalIdsCount: externalIds.length,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("politician", politician.slug);
    for (const electionId of presidentialElectionIds) {
      invalidatePresidentialCandidacyTags(electionId);
    }

    return NextResponse.json(politician);
  })
);
