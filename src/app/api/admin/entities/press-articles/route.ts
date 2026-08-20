import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  id: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

const resultSelect = {
  id: true,
  title: true,
  url: true,
  feedSource: true,
  publishedAt: true,
  aiAnalyzedAt: true,
  isAffairRelated: true,
  _count: { select: { mentions: true, affairLinks: true } },
} as const;

export const GET = withAdminAuth(async (request: NextRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres de recherche invalides" }, { status: 400 });
  }
  const { q, id, page, limit } = parsed.data;
  if (id) {
    const result = await db.pressArticle.findUnique({ where: { id }, select: resultSelect });
    return NextResponse.json({ result: result ?? null });
  }
  if (!q || q.length < 2) return NextResponse.json({ results: [], page, limit, hasMore: false });

  const where = {
    OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { url: { contains: q, mode: "insensitive" as const } },
      { feedSource: { contains: q, mode: "insensitive" as const } },
    ],
  };
  const rows = await db.pressArticle.findMany({
    where,
    select: resultSelect,
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit + 1,
  });
  return NextResponse.json({
    results: rows.slice(0, limit),
    page,
    limit,
    hasMore: rows.length > limit,
  });
});
