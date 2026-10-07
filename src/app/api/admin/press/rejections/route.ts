import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { deleteRejectionsSchema } from "@/lib/security/schemas";
import { parsePagination } from "@/lib/api/pagination";

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const days = searchParams.get("days"); // "7", "30", or null (all)
  const { page, limit, skip } = parsePagination(searchParams);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (search) {
    where.OR = [
      { politicianName: { contains: search, mode: "insensitive" } },
      { politician: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (days && days !== "all") {
    const d = parseInt(days, 10);
    if (!isNaN(d) && d > 0) {
      where.rejectedAt = { gte: new Date(Date.now() - d * 86_400_000) };
    }
  }

  const [rejections, total] = await Promise.all([
    db.pressAnalysisRejection.findMany({
      where,
      orderBy: { rejectedAt: "desc" },
      skip,
      take: limit,
      include: {
        article: {
          select: { id: true, title: true, feedSource: true, publishedAt: true, url: true },
        },
        politician: {
          select: { id: true, fullName: true, slug: true, photoUrl: true, blobPhotoUrl: true },
        },
      },
    }),
    db.pressAnalysisRejection.count({ where }),
  ]);

  return NextResponse.json({
    data: rejections,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const DELETE = withAdminAuth(
  withValidation(deleteRejectionsSchema, async (_request, _context, { ids }) => {
    const result = await db.pressAnalysisRejection.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ deleted: result.count });
  })
);
