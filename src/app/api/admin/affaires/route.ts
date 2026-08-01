import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateAffairSlug } from "@/lib/utils";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { invalidateEntity } from "@/lib/cache";
import { createAffairSchema } from "@/lib/validations/affairs";
import { AffairCategory, PublicationStatus, AffairStatus } from "@/generated/prisma";
import { computeSeverity, isInherentlyMandateCategory } from "@/config/labels";
import { parsePagination } from "@/lib/api/pagination";
import { resolveAffairPolitician } from "@/lib/affair-matching";

const VALID_PUB_STATUSES = new Set(Object.values(PublicationStatus));
const VALID_CATEGORIES = new Set(Object.values(AffairCategory));
const VALID_AFFAIR_STATUSES = new Set(Object.values(AffairStatus));

function validateEnum<T>(value: string | null, validSet: Set<T>): T | undefined {
  if (!value) return undefined;
  return validSet.has(value as T) ? (value as T) : undefined;
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const pubStatus = validateEnum(searchParams.get("publicationStatus"), VALID_PUB_STATUSES);
  const category = validateEnum(searchParams.get("category"), VALID_CATEGORIES);
  const status = validateEnum(searchParams.get("status"), VALID_AFFAIR_STATUSES);
  const search = searchParams.get("search");
  const hasEcli = searchParams.get("hasEcli");
  const { page, limit, skip } = parsePagination(searchParams);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (pubStatus) where.publicationStatus = pubStatus;
  if (category) where.category = category;
  if (status) where.status = status;
  // Filtre sur les décisions rattachées, plus sur la colonne de l'affaire, qui n'est
  // plus alimentée (#545). « sans ECLI » signifie désormais « aucune décision
  // rattachée n'en porte », ce qui est la question que se pose réellement un
  // modérateur.
  if (hasEcli === "true") {
    where.courtDecisions = { some: { courtDecision: { ecli: { not: null } } } };
  }
  if (hasEcli === "false") {
    where.courtDecisions = { none: { courtDecision: { ecli: { not: null } } } };
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { politician: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [affairs, total, countDraft, countPublished, countRejected] = await Promise.all([
    db.affair.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        politician: {
          select: { id: true, fullName: true, slug: true, photoUrl: true },
        },
        sources: { select: { id: true, sourceType: true } },
        moderationReviews: {
          where: { appliedAt: null },
          orderBy: { createdAt: "desc" as const },
          take: 1,
          select: {
            id: true,
            recommendation: true,
            confidence: true,
            reasoning: true,
            suggestedTitle: true,
            suggestedDescription: true,
            suggestedStatus: true,
            suggestedCategory: true,
            issues: true,
            duplicateOfId: true,
          },
        },
      },
    }),
    db.affair.count({ where }),
    db.affair.count({ where: { publicationStatus: "DRAFT" } }),
    db.affair.count({ where: { publicationStatus: "PUBLISHED" } }),
    db.affair.count({ where: { publicationStatus: "REJECTED" } }),
  ]);

  return NextResponse.json({
    data: affairs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    counts: {
      all: countDraft + countPublished + countRejected,
      DRAFT: countDraft,
      PUBLISHED: countPublished,
      REJECTED: countRejected,
    },
  });
});

export const POST = withAdminAuth(async (request: NextRequest) => {
  const body = await request.json();

  const parsed = createAffairSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Check politician exists
  const politician = await db.politician.findUnique({
    where: { id: data.politicianId },
    select: { id: true, slug: true },
  });

  if (!politician) {
    return NextResponse.json({ error: "Politique non trouvé" }, { status: 404 });
  }

  // Generate unique slug with politician name
  const baseSlug = generateAffairSlug(politician.slug, data.title);
  let slug = baseSlug;
  let counter = 1;

  while (await db.affair.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // Compute severity
  const mandateRelated = data.isRelatedToMandate ?? isInherentlyMandateCategory(data.category);
  const severity = computeSeverity(data.category, mandateRelated);

  // Resolver sanity check: soft warning only, never blocks creation.
  // Records a MANUAL_OVERRIDE decision when the resolver confidently identifies
  // a different politician than the moderator's choice.
  let resolverWarning: string | null = null;
  let resolverDecisionId: string | null = null;

  try {
    const resolverText = [data.title, data.description].filter(Boolean).join("\n\n");

    if (resolverText.length > 0) {
      const resolveResult = await resolveAffairPolitician({
        text: resolverText,
        metadata: {
          source: "MANUAL",
          sourceRef: "admin:manual",
          factsDate: data.factsDate ? new Date(data.factsDate) : null,
        },
      });

      resolverDecisionId = resolveResult.decisionId;

      if (
        resolveResult.judgment === "SAME" &&
        resolveResult.topCandidateId !== null &&
        resolveResult.topCandidateId !== data.politicianId
      ) {
        // Resolver is confident but disagrees: mark override in the audit trail.
        await db.affairPoliticianDecision.update({
          where: { id: resolveResult.decisionId },
          data: {
            judgment: "MANUAL_OVERRIDE",
            chosenPoliticianId: data.politicianId,
          },
        });
        resolverWarning =
          `Le resolver a détecté un politicien différent (${resolveResult.topCandidateId}) ` +
          `que celui choisi manuellement (${data.politicianId}). Veuillez vérifier.`;
      }
    }
  } catch (err) {
    console.error("[admin/affaires] resolver sanity check failed:", err);
  }

  // Create affair with sources
  const affair = await db.affair.create({
    data: {
      politicianId: data.politicianId,
      title: data.title,
      slug,
      description: data.description,
      status: data.status,
      category: data.category,
      severity,
      isRelatedToMandate: mandateRelated,
      involvement: data.involvement || "DIRECT",
      subjectLabel: data.subjectLabel?.trim() || null,
      subjectKind: data.subjectKind || null,
      subjectNote: data.subjectNote?.trim() || null,
      involvementNote: data.involvementNote?.trim() || null,
      factsDate: data.factsDate ? new Date(data.factsDate) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      verdictDate: data.verdictDate ? new Date(data.verdictDate) : null,
      sentence: data.sentence || null,
      appeal: data.appeal || false,
      // Detailed sentence
      prisonMonths: data.prisonMonths || null,
      // `?? null` and not `|| null`: 0 means "entirely suspended", not "absent" (#576).
      prisonFirmMonths: data.prisonFirmMonths ?? null,
      fineAmount: data.fineAmount || null,
      ineligibilityMonths: data.ineligibilityMonths || null,
      ineligibilityFirmMonths: data.ineligibilityFirmMonths ?? null,
      communityService: data.communityService || null,
      otherSentence: data.otherSentence || null,
      // Jurisdiction
      court: data.court || null,
      caseNumber: data.caseNumber || null,
      // Judicial identifiers
      linkedAffairId: data.linkedAffairId ?? null,
      sources: {
        create: data.sources.map((s) => ({
          url: s.url,
          title: s.title,
          publisher: s.publisher,
          publishedAt: new Date(s.publishedAt),
          excerpt: s.excerpt || null,
          sourceType: s.sourceType || "MANUAL",
        })),
      },
    },
    include: {
      sources: true,
      politician: { select: { fullName: true } },
    },
  });

  // Log action
  await db.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "Affair",
      entityId: affair.id,
      changes: { title: affair.title, politician: affair.politician.fullName },
    },
  });

  invalidateEntity("affair");
  invalidateEntity("politician", politician.slug);

  return NextResponse.json({ affair, resolverWarning, resolverDecisionId }, { status: 201 });
});
