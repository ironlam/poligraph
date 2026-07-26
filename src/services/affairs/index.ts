import { db } from "@/lib/db";
import type {
  AffairFilters,
  PaginatedResponse,
  AffairWithPolitician,
  AffairWithSources,
  CreateAffairInput,
} from "@/types";
import { generateAffairSlug } from "@/lib/utils";
import { computeSeverity, isInherentlyMandateCategory } from "@/config/labels";

// Re-export matching service
export { findMatchingAffairs, isDuplicate } from "./matching";
export type { MatchResult, MatchCandidate, MatchConfidence } from "./matching";

const DEFAULT_LIMIT = 20;

export async function getAffairs(
  filters: AffairFilters = {}
): Promise<PaginatedResponse<AffairWithPolitician>> {
  const { search, politicianId, status, category, page = 1, limit = DEFAULT_LIMIT } = filters;

  const where = {
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(politicianId && { politicianId }),
    ...(status && { status }),
    ...(category && { category }),
  };

  const [data, total] = await Promise.all([
    db.affair.findMany({
      where,
      include: {
        politician: {
          include: {
            currentParty: true,
          },
        },
        sources: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.affair.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getAffairBySlug(slug: string): Promise<AffairWithPolitician | null> {
  return db.affair.findUnique({
    where: { slug },
    include: {
      politician: {
        include: {
          currentParty: true,
        },
      },
      sources: {
        orderBy: { publishedAt: "desc" },
      },
    },
  });
}

export async function getRecentAffairs(limit = 10): Promise<AffairWithPolitician[]> {
  return db.affair.findMany({
    include: {
      politician: {
        include: {
          currentParty: true,
        },
      },
      sources: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function createAffair(input: CreateAffairInput): Promise<AffairWithSources> {
  const politician = await db.politician.findUnique({
    where: { id: input.politicianId },
    select: { slug: true },
  });
  const slug = generateAffairSlug(politician?.slug ?? "", input.title);

  // Compute severity from category and mandate relation
  const mandateRelated = input.isRelatedToMandate ?? isInherentlyMandateCategory(input.category);
  const severity = computeSeverity(input.category, mandateRelated);

  return db.affair.create({
    data: {
      politicianId: input.politicianId,
      title: input.title,
      slug,
      description: input.description,
      status: input.status,
      category: input.category,
      severity,
      isRelatedToMandate: mandateRelated,
      factsDate: input.factsDate,
      startDate: input.startDate,
      verdictDate: input.verdictDate,
      sentence: input.sentence,
      sources: {
        create: input.sources,
      },
    },
    include: {
      sources: true,
    },
  });
}

export async function getAffairsStats() {
  const [total, byStatus, byCategory] = await Promise.all([
    db.affair.count(),
    db.affair.groupBy({
      by: ["status"],
      _count: true,
    }),
    db.affair.groupBy({
      by: ["category"],
      _count: true,
    }),
  ]);

  return {
    total,
    byStatus: byStatus.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {}),
    byCategory: byCategory.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = item._count;
      return acc;
    }, {}),
  };
}
