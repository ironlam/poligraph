import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { invalidateEntity } from "@/lib/cache";
import { generateAffairSlug } from "@/lib/utils";
import { trackStatusChange } from "@/services/affairs/status-tracking";
import { updateAffairSchema } from "@/lib/validations/affairs";
import { computeSeverity, isInherentlyMandateCategory } from "@/config/labels";
import {
  assertPublishable,
  PublishGuardError,
  VERIFIED_BY_MODERATION,
  PUBLISHED_STATUS,
} from "@/lib/affairs/publish-guard";

export const GET = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  const affair = await db.affair.findUnique({
    where: { id },
    include: {
      politician: { select: { id: true, fullName: true, slug: true } },
      sources: true,
    },
  });

  if (!affair) {
    return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
  }

  return NextResponse.json(affair);
});

export const PUT = withAdminAuth(async (request: NextRequest, context) => {
  const { id } = await context.params;

  const body = await request.json();

  const parsed = updateAffairSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Check affair exists
  const existing = await db.affair.findUnique({
    where: { id },
    include: { sources: true, politician: { select: { slug: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
  }

  // Regenerate slug if title or politician changed
  let newSlug: string | undefined;
  let oldSlugToSave: string | undefined;
  if (existing.title !== data.title || existing.politicianId !== data.politicianId) {
    const politicianSlug =
      existing.politicianId !== data.politicianId
        ? ((
            await db.politician.findUnique({
              where: { id: data.politicianId },
              select: { slug: true },
            })
          )?.slug ?? existing.politician.slug)
        : existing.politician.slug;

    const baseSlug = generateAffairSlug(politicianSlug, data.title);
    newSlug = baseSlug;
    let counter = 1;
    while (
      await db.affair.findFirst({
        where: { slug: newSlug, id: { not: id } },
      })
    ) {
      newSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    // Save old slug for redirect
    if (newSlug !== existing.slug) {
      oldSlugToSave = existing.slug;
    }
  }

  // Recompute severity on update
  const mandateRelated = data.isRelatedToMandate ?? isInherentlyMandateCategory(data.category);
  const severity = computeSeverity(data.category, mandateRelated);

  // Update affair
  const affair = await db.affair.update({
    where: { id },
    data: {
      politicianId: data.politicianId,
      title: data.title,
      ...(newSlug && { slug: newSlug }),
      ...(oldSlugToSave && { oldSlugs: { push: oldSlugToSave } }),
      description: data.description,
      status: data.status,
      category: data.category,
      severity,
      isRelatedToMandate: mandateRelated,
      involvement: data.involvement || "DIRECT",
      // RGPD art. 10 : la transition vers PUBLISHED passe exclusivement par
      // le guard (après application des champs et des sources). Les autres
      // statuts (dépublication) restent des écritures directes.
      ...(data.publicationStatus &&
        data.publicationStatus !== PUBLISHED_STATUS && {
          publicationStatus: data.publicationStatus,
        }),
      factsDate: data.factsDate ? new Date(data.factsDate) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      verdictDate: data.verdictDate ? new Date(data.verdictDate) : null,
      sentence: data.sentence || null,
      appeal: data.appeal || false,
      // Detailed sentence
      prisonMonths: data.prisonMonths ?? null,
      prisonFirmMonths: data.prisonFirmMonths ?? null,
      fineAmount: data.fineAmount ?? null,
      ineligibilityMonths: data.ineligibilityMonths ?? null,
      ineligibilityFirmMonths: data.ineligibilityFirmMonths ?? null,
      communityService: data.communityService ?? null,
      otherSentence: data.otherSentence || null,
      // Jurisdiction
      court: data.court || null,
      caseNumber: data.caseNumber || null,
      // Judicial identifiers
      linkedAffairId: data.linkedAffairId ?? null,
    },
  });

  // Track status change for audit trail
  if (existing.status !== data.status) {
    await trackStatusChange(id!, existing.status, data.status, {
      type: "MANUAL",
      title: "Modification manuelle via l'admin",
    });
  }

  // Handle sources: delete old ones and create new ones
  // (simpler than diffing for MVP)
  await db.source.deleteMany({ where: { affairId: id } });

  await db.source.createMany({
    data: data.sources.map((s) => ({
      affairId: id!,
      url: s.url,
      title: s.title,
      publisher: s.publisher,
      publishedAt: new Date(s.publishedAt),
      excerpt: s.excerpt || null,
      sourceType: s.sourceType || "MANUAL",
    }))!,
  });

  // Transition vers PUBLISHED : via le guard, qui re-vérifie sources et
  // rattachements puis écrit verifiedAt/verifiedBy atomiquement.
  const wantsPublish =
    data.publicationStatus === PUBLISHED_STATUS && existing.publicationStatus !== PUBLISHED_STATUS;
  if (wantsPublish) {
    try {
      await assertPublishable(id!, { verifiedBy: VERIFIED_BY_MODERATION });
    } catch (err) {
      if (err instanceof PublishGuardError) {
        return NextResponse.json(
          {
            error: "Affaire non publiable",
            reasons: err.reasons.map((r) => r.message),
            fieldsSaved: true,
          },
          { status: 422 }
        );
      }
      throw err;
    }
  }

  // Log action
  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "Affair",
      entityId: affair.id,
      changes: { title: affair.title },
    },
  });

  // Invalidate cache for affair and related politician
  invalidateEntity("affair");
  const pol = await db.politician.findUnique({
    where: { id: data.politicianId },
    select: { slug: true },
  });
  if (pol) invalidateEntity("politician", pol.slug);

  return NextResponse.json(affair);
});

export const DELETE = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  const affair = await db.affair.findUnique({
    where: { id },
    select: { id: true, title: true, politician: { select: { slug: true } } },
  });

  if (!affair) {
    return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
  }

  // Delete affair (sources will cascade)
  await db.affair.delete({ where: { id } });

  // Log action
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "Affair",
      entityId: id!,
      changes: { title: affair.title },
    },
  });

  invalidateEntity("affair");
  if (affair.politician?.slug) invalidateEntity("politician", affair.politician.slug);

  return NextResponse.json({ success: true });
});
