import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { db } from "@/lib/db";
import { parsePublicId } from "@/lib/public-ids";

export const GET = withAdminAuth(async (request: NextRequest) => {
  const parsed = z
    .object({
      q: z.string().trim().max(100).optional(),
      excludeId: z.string().trim().max(100).optional(),
      id: z.string().trim().max(100).optional(),
    })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  const q = parsed.data.q ?? "";
  const { excludeId, id } = parsed.data;

  if (id) {
    const affair = await db.affair.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        involvement: true,
        publicationStatus: true,
        status: true,
        linkedAffairId: true,
        politician: { select: { id: true, fullName: true, slug: true } },
      },
    });
    return NextResponse.json({ results: affair ? [affair] : [] });
  }

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const searchedId = parsePublicId(q.toUpperCase());
  const affairs = await db.affair.findMany({
    where: {
      ...(searchedId?.entityType === "affair"
        ? { publicId: searchedId.publicId }
        : { title: { contains: q, mode: "insensitive" as const } }),
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      involvement: true,
      publicationStatus: true,
      status: true,
      linkedAffairId: true,
      politician: { select: { id: true, fullName: true, slug: true } },
    },
    take: 20,
    orderBy: { title: "asc" },
  });

  return NextResponse.json({ results: affairs });
});
